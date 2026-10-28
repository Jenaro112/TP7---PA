import express from 'express';
import cors from 'cors';
import {
  TOPICS,
  createKafkaClient,
  connectMongo,
  tryMarkProcessed,
  EventoEstadoSchema,
  FranjaHoraria
} from '@rutasur/shared';
import { runHistoricalReprocess } from './reprocess';

const CONSUMER_GROUP = 'analitica';
const PORT = parseInt(process.env.PORT || '3002', 10);

async function main() {
  console.log(`[${CONSUMER_GROUP}] Iniciando servicio de Analítica...`);

  let mongoConn;
  let attempts = 0;
  while (!mongoConn && attempts < 20) {
    try {
      attempts++;
      mongoConn = await connectMongo();
    } catch (e: any) {
      console.warn(`[${CONSUMER_GROUP}] MongoDB no disponible aún (intento ${attempts}/20): ${e.message}. Reintentando en 3s...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  if (!mongoConn) {
    throw new Error(`[${CONSUMER_GROUP}] No se pudo conectar a MongoDB.`);
  }

  const { db, collections } = mongoConn;

  const kafka = createKafkaClient('analitica');
  const consumer = kafka.consumer({
    groupId: CONSUMER_GROUP,
    retry: { retries: 5 }
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: TOPICS.ENVIOS_ESTADOS,
    fromBeginning: true
  });

  console.log(`[${CONSUMER_GROUP}] Suscrito a ${TOPICS.ENVIOS_ESTADOS}`);

  // Express API para consultas y reprocesamiento
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'analitica' });
  });

  app.get('/metricas', async (req, res) => {
    try {
      const { zonaId, hubId, fecha } = req.query;
      const filter: any = {};
      if (zonaId) filter.zonaId = zonaId;
      if (hubId) filter.hubId = hubId;
      if (fecha) filter.fecha = fecha;

      const items = await collections.metricasDiarias.find(filter).toArray();
      res.json({ success: true, count: items.length, data: items });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/indicador-4', async (_req, res) => {
    try {
      const items = await collections.tiempoMedioHub.find({}).toArray();
      res.json({ success: true, data: items });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/reprocess', async (_req, res) => {
    try {
      console.log('[Analítica API] Disparando reprocesamiento de eventos históricos...');
      const result = await runHistoricalReprocess(db);
      res.json({ success: true, ...result });
    } catch (e: any) {
      console.error('[Analítica API] Error en reprocesamiento:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`[${CONSUMER_GROUP}] Servidor HTTP escuchando en puerto ${PORT}`);
  });

  // Consumer loop
  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const offset = message.offset;
      const rawValue = message.value?.toString();

      if (!rawValue) {
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(rawValue);
      } catch {
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      const parseResult = EventoEstadoSchema.safeParse(payload);
      if (!parseResult.success) {
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      const event = parseResult.data;

      // Idempotencia
      const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
      if (!isNew) {
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      const eventDate = new Date(event.ocurridoEn);
      const fechaStr = eventDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
      const franja: FranjaHoraria = eventDate.getHours() < 13 ? 'MANANA' : 'TARDE';
      const zonaId = event.zonaId || 'ZONA-CENTRO';
      const hubId = event.hubId || 'HUB-CENTRO';

      const key = { fecha: fechaStr, zonaId, franja };

      if (event.tipo === 'CREADO') {
        // Incremento atómico de totalEnvios
        await collections.metricasDiarias.updateOne(
          key,
          {
            $inc: { totalEnvios: 1 },
            $setOnInsert: {
              hubId,
              entregasPrimerIntento: 0,
              entregasFallidas: 0,
              entregadosTotal: 0,
              'motivosFallo.AUSENTE': 0,
              'motivosFallo.DIRECCION_INCORRECTA': 0,
              'motivosFallo.RECHAZADO': 0,
              'motivosFallo.ZONA_INACCESIBLE': 0,
              'cumplimientoSla.cumplidos': 0,
              'cumplimientoSla.fallidos': 0
            }
          },
          { upsert: true }
        );
      } else if (event.tipo === 'ENTREGADO') {
        // Obtener estado del envío para ver si fue primer intento
        const doc = await collections.envios.findOne({ shipmentId: event.shipmentId });
        const esPrimerIntento = (doc?.intentos || 0) <= 1;

        const incUpdate: any = {
          entregadosTotal: 1
        };

        if (esPrimerIntento) {
          incUpdate.entregasPrimerIntento = 1;
        }

        // Chequear cumplimiento SLA
        if (doc?.promesa?.venceEn) {
          if (eventDate <= doc.promesa.venceEn) {
            incUpdate['cumplimientoSla.cumplidos'] = 1;
          } else {
            incUpdate['cumplimientoSla.fallidos'] = 1;
          }
        } else {
          incUpdate['cumplimientoSla.cumplidos'] = 1;
        }

        await collections.metricasDiarias.updateOne(
          key,
          {
            $inc: incUpdate,
            $setOnInsert: {
              hubId,
              totalEnvios: 0,
              entregasPrimerIntento: 0,
              entregasFallidas: 0,
              'motivosFallo.AUSENTE': 0,
              'motivosFallo.DIRECCION_INCORRECTA': 0,
              'motivosFallo.RECHAZADO': 0,
              'motivosFallo.ZONA_INACCESIBLE': 0
            }
          },
          { upsert: true }
        );
      } else if (event.tipo === 'ENTREGA_FALLIDA' && event.motivo) {
        // Incremento atómico de fallos y desglose por motivo
        await collections.metricasDiarias.updateOne(
          key,
          {
            $inc: {
              entregasFallidas: 1,
              [`motivosFallo.${event.motivo}`]: 1
            },
            $setOnInsert: {
              hubId,
              totalEnvios: 0,
              entregasPrimerIntento: 0,
              entregadosTotal: 0,
              'cumplimientoSla.cumplidos': 0,
              'cumplimientoSla.fallidos': 0
            }
          },
          { upsert: true }
        );
      }

      console.log(
        `[${CONSUMER_GROUP}] [Observabilidad] Metricas actualizadas para ${event.shipmentId} (part=${partition}, offset=${offset})`
      );

      await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
    }
  });

  const shutdown = async () => {
    console.log(`[${CONSUMER_GROUP}] Cerrando conexiones...`);
    await consumer.disconnect();
    await mongoConn.client.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(`[${CONSUMER_GROUP}] Error fatal:`, err);
  process.exit(1);
});
