import { v4 as uuidv4 } from 'uuid';
import {
  TOPICS,
  createKafkaClient,
  createProducer,
  connectMongo,
  EventoEstadoSchema,
  EventoPromesaSchema,
  EventoAlertaSLA,
  ReglaSLA,
  PrioridadAlerta,
  EstadoEnvio
} from '@rutasur/shared';

const CONSUMER_GROUP = 'monitor-sla';
const ACCELERATION_FACTOR = parseInt(process.env.ACCELERATION_FACTOR || '120', 10);

interface AlertaActiva {
  alertaId: string;
  regla: ReglaSLA;
  prioridad: PrioridadAlerta;
}

interface ShipmentSLAState {
  shipmentId: string;
  estado: EstadoEnvio | string;
  venceEn?: Date;
  compromiso?: Date;
  ingresoHub: boolean;
  enReparto: boolean;
  entregado: boolean;
  alertasEmitidas: string[];
  alertasActivas: AlertaActiva[];
  updatedAt: Date;
}

async function main() {
  console.log(`[${CONSUMER_GROUP}] Iniciando Monitor de SLA...`);

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

  const { db } = mongoConn;
  const stateCollection = db.collection<ShipmentSLAState>('monitor_sla_estado');
  await stateCollection.createIndex({ shipmentId: 1 }, { unique: true });

  // In-memory state table
  const stateMap = new Map<string, ShipmentSLAState>();

  // Rehidratar desde MongoDB para tolerancia a reinicios
  const existingDocs = await stateCollection.find({ entregado: false }).toArray();
  for (const doc of existingDocs) {
    stateMap.set(doc.shipmentId, doc);
  }
  console.log(`[${CONSUMER_GROUP}] Rehidratados ${stateMap.size} envíos abiertos desde MongoDB.`);

  // Tracking del reloj simulado
  let baseSimulatedTime = Date.now();
  let baseRealTime = Date.now();

  const getSimulatedNow = (): Date => {
    const elapsedReal = Date.now() - baseRealTime;
    const elapsedSimulated = elapsedReal * ACCELERATION_FACTOR;
    return new Date(baseSimulatedTime + elapsedSimulated);
  };

  const advanceSimulatedTime = (eventDate: Date) => {
    const currentSim = getSimulatedNow().getTime();
    if (eventDate.getTime() > currentSim) {
      baseSimulatedTime = eventDate.getTime();
      baseRealTime = Date.now();
    }
  };

  // Kafka setup
  const kafka = createKafkaClient('monitor-sla');
  const producer = await createProducer(kafka);
  const consumer = kafka.consumer({
    groupId: CONSUMER_GROUP,
    retry: { retries: 5 }
  });

  await consumer.connect();
  await consumer.subscribe({
    topics: [TOPICS.ENVIOS_ESTADOS, TOPICS.ENVIOS_PROMESAS],
    fromBeginning: true
  });

  console.log(`[${CONSUMER_GROUP}] Suscrito a ${TOPICS.ENVIOS_ESTADOS} y ${TOPICS.ENVIOS_PROMESAS}`);

  // Helper para persistir y emitir alerta
  const emitAlert = async (
    state: ShipmentSLAState,
    regla: ReglaSLA,
    prioridad: PrioridadAlerta,
    causa: string,
    ocurridoEn: Date
  ) => {
    if (state.alertasEmitidas.includes(regla)) {
      return; // "Sin repeticion: una misma regla no vuelve a alertar sobre el mismo envio"
    }

    const alertaId = `ALT-${state.shipmentId}-${regla}`;
    const alertEvent: EventoAlertaSLA = {
      eventId: uuidv4(),
      alertaId,
      shipmentId: state.shipmentId,
      regla,
      prioridad,
      estado: 'ABIERTA',
      causa,
      ocurridoEn: ocurridoEn.toISOString(),
      version: '1.0.0'
    };

    state.alertasEmitidas.push(regla);
    state.alertasActivas.push({ alertaId, regla, prioridad });
    state.updatedAt = new Date();

    // Persistir en MongoDB
    await stateCollection.updateOne(
      { shipmentId: state.shipmentId },
      { $set: state },
      { upsert: true }
    );

    // Publicar a Kafka
    await producer.send({
      topic: TOPICS.ALERTAS_SLA,
      messages: [
        {
          key: state.shipmentId,
          value: JSON.stringify(alertEvent)
        }
      ]
    });

    console.warn(
      `[${CONSUMER_GROUP}] ALERTA SLA EMITIDA: [${prioridad}] ${regla} para ${state.shipmentId} -> ${causa}`
    );
  };

  // Helper para cerrar alertas al entregar
  const closeAlerts = async (state: ShipmentSLAState, ocurridoEn: Date) => {
    if (state.alertasActivas.length === 0) return;

    for (const activa of state.alertasActivas) {
      const closeEvent: EventoAlertaSLA = {
        eventId: uuidv4(),
        alertaId: activa.alertaId,
        shipmentId: state.shipmentId,
        regla: activa.regla,
        prioridad: activa.prioridad,
        estado: 'CERRADA',
        causa: 'Envío entregado exitosamente',
        ocurridoEn: ocurridoEn.toISOString(),
        cerradaEn: ocurridoEn.toISOString(),
        version: '1.0.0'
      };

      await producer.send({
        topic: TOPICS.ALERTAS_SLA,
        messages: [
          {
            key: state.shipmentId,
            value: JSON.stringify(closeEvent)
          }
        ]
      });

      console.log(`[${CONSUMER_GROUP}] ALERTA SLA CERRADA: ${activa.alertaId} para ${state.shipmentId}`);
    }

    state.alertasActivas = [];
    state.updatedAt = new Date();
    await stateCollection.updateOne(
      { shipmentId: state.shipmentId },
      { $set: state },
      { upsert: true }
    );
  };

  // Evaluacion periódica de todos los envíos abiertos
  const evaluateOpenShipments = async () => {
    const simNow = getSimulatedNow();

    for (const [_id, state] of stateMap.entries()) {
      if (state.entregado || !state.venceEn) continue;

      const diffMs = state.venceEn.getTime() - simNow.getTime();
      const diffHours = diffMs / (1000 * 3600);

      // Regla 4: VENCIDO (Crítica)
      if (diffHours < 0) {
        await emitAlert(
          state,
          'VENCIDO',
          'CRITICA',
          `Plazo de entrega superado (${state.venceEn.toISOString()}) sin registrarse entrega.`,
          simNow
        );
      }
      // Regla 2: SIN_SALIDA (Alta) - Faltan menos de 4h y no está en reparto
      else if (diffHours < 4 && !state.enReparto) {
        await emitAlert(
          state,
          'SIN_SALIDA',
          'ALTA',
          `Faltan ${diffHours.toFixed(1)} h para el vencimiento y el paquete no ha salido a reparto.`,
          simNow
        );
      }
      // Regla 1: SIN_INGRESO (Media) - Faltan menos de 10h y no ingresó al hub
      else if (diffHours < 10 && !state.ingresoHub) {
        await emitAlert(
          state,
          'SIN_INGRESO',
          'MEDIA',
          `Faltan ${diffHours.toFixed(1)} h para el vencimiento y el paquete aún no ingresó al centro de distribución.`,
          simNow
        );
      }
    }
  };

  // Intervalo periódico de evaluacion
  const evalInterval = setInterval(() => {
    evaluateOpenShipments().catch(e => console.error(`[${CONSUMER_GROUP}] Error en evaluacion periodica:`, e));
  }, 2000);

  // Consumo de Kafka
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

      if (topic === TOPICS.ENVIOS_PROMESAS) {
        const parseResult = EventoPromesaSchema.safeParse(payload);
        if (parseResult.success) {
          const prom = parseResult.data;
          const shipmentId = prom.shipmentId;
          const venceEn = new Date(prom.promesa.venceEn);
          const compromiso = new Date(prom.promesa.compromiso);

          advanceSimulatedTime(compromiso);

          let state = stateMap.get(shipmentId);
          if (!state) {
            state = {
              shipmentId,
              estado: 'CREADO',
              venceEn,
              compromiso,
              ingresoHub: false,
              enReparto: false,
              entregado: false,
              alertasEmitidas: [],
              alertasActivas: [],
              updatedAt: new Date()
            };
            stateMap.set(shipmentId, state);
          } else {
            state.venceEn = venceEn;
            state.compromiso = compromiso;
          }

          await stateCollection.updateOne(
            { shipmentId },
            { $set: state },
            { upsert: true }
          );
        }
      } else if (topic === TOPICS.ENVIOS_ESTADOS) {
        const parseResult = EventoEstadoSchema.safeParse(payload);
        if (parseResult.success) {
          const event = parseResult.data;
          const shipmentId = event.shipmentId;
          const eventDate = new Date(event.ocurridoEn);

          advanceSimulatedTime(eventDate);

          let state = stateMap.get(shipmentId);
          if (!state) {
            state = {
              shipmentId,
              estado: event.tipo,
              ingresoHub: event.tipo === 'INGRESADO_HUB',
              enReparto: event.tipo === 'EN_REPARTO',
              entregado: event.tipo === 'ENTREGADO',
              alertasEmitidas: [],
              alertasActivas: [],
              updatedAt: new Date()
            };
            stateMap.set(shipmentId, state);
          } else {
            state.estado = event.tipo;
            if (event.tipo === 'INGRESADO_HUB') state.ingresoHub = true;
            if (event.tipo === 'EN_REPARTO') state.enReparto = true;
            if (event.tipo === 'ENTREGADO') state.entregado = true;
          }

          // Regla 3: FALLO_DIA_LIMITE (Alta)
          // "ENTREGA_FALLIDA y la promesa vence hoy"
          if (event.tipo === 'ENTREGA_FALLIDA' && state.venceEn) {
            const isSameDay =
              eventDate.getFullYear() === state.venceEn.getFullYear() &&
              eventDate.getMonth() === state.venceEn.getMonth() &&
              eventDate.getDate() === state.venceEn.getDate();

            if (isSameDay) {
              await emitAlert(
                state,
                'FALLO_DIA_LIMITE',
                'ALTA',
                `Intento fallido (${event.motivo}) en el mismo día límite del vencimiento de la promesa.`,
                eventDate
              );
            }
          }

          // Cierre: "cuando llega ENTREGADO, el monitor emite el cierre de la alerta"
          if (event.tipo === 'ENTREGADO') {
            await closeAlerts(state, eventDate);
          }

          await stateCollection.updateOne(
            { shipmentId },
            { $set: state },
            { upsert: true }
          );

          // Evaluar de inmediato para este envío
          if (!state.entregado && state.venceEn) {
            const simNow = getSimulatedNow();
            const diffHours = (state.venceEn.getTime() - simNow.getTime()) / (1000 * 3600);
            if (diffHours < 0) {
              await emitAlert(state, 'VENCIDO', 'CRITICA', `Plazo superado sin entrega.`, simNow);
            } else if (diffHours < 4 && !state.enReparto) {
              await emitAlert(state, 'SIN_SALIDA', 'ALTA', `Faltan <4h y no salió a reparto.`, simNow);
            } else if (diffHours < 10 && !state.ingresoHub) {
              await emitAlert(state, 'SIN_INGRESO', 'MEDIA', `Faltan <10h y no ingresó a hub.`, simNow);
            }
          }
        }
      }

      await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
    }
  });

  const shutdown = async () => {
    console.log(`[${CONSUMER_GROUP}] Cerrando conexiones...`);
    clearInterval(evalInterval);
    await consumer.disconnect();
    await producer.disconnect();
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
