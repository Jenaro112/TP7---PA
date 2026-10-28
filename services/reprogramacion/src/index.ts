import { v4 as uuidv4 } from 'uuid';
import {
  TOPICS,
  createKafkaClient,
  createProducer,
  connectMongo,
  tryMarkProcessed,
  EventoEstadoSchema,
  EventoReprogramacion,
  AccionReprogramacion,
  FranjaHoraria
} from '@rutasur/shared';

const CONSUMER_GROUP = 'reprogramacion';

function getNextBusinessDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  const day = next.getDay();
  if (day === 0) { // Domingo -> Lunes
    next.setDate(next.getDate() + 1);
  } else if (day === 6) { // Sabado -> Lunes
    next.setDate(next.getDate() + 2);
  }
  return next;
}

async function main() {
  console.log(`[${CONSUMER_GROUP}] Iniciando servicio Reprogramación...`);

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

  const kafka = createKafkaClient('reprogramacion');
  const producer = await createProducer(kafka);
  const consumer = kafka.consumer({
    groupId: CONSUMER_GROUP,
    retry: { retries: 5 }
  });

  await consumer.connect();
  await consumer.subscribe({
    topic: TOPICS.ENVIOS_ESTADOS,
    fromBeginning: false
  });

  console.log(`[${CONSUMER_GROUP}] Suscrito a ${TOPICS.ENVIOS_ESTADOS}`);

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

      // Solo nos interesa ENTREGA_FALLIDA
      if (event.tipo === 'ENTREGA_FALLIDA') {
        const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
        if (isNew) {
          // Consultar el historial / intentos actuales en MongoDB
          const currentDoc = await collections.envios.findOne({ shipmentId: event.shipmentId });
          // Si el doc ya tiene intentos registrados o si este es el primer intento
          const currentAttempts = (currentDoc?.intentos || 0) + 1;

          let accion: AccionReprogramacion;
          let descripcion: string;
          let nuevaFechaEstimada: string | undefined;
          let franjaHoraria: FranjaHoraria | undefined;

          const occurredDate = new Date(event.ocurridoEn);
          const currentHour = occurredDate.getHours();
          const franjaActual: FranjaHoraria = currentHour < 13 ? 'MANANA' : 'TARDE';
          const franjaOpuesta: FranjaHoraria = franjaActual === 'MANANA' ? 'TARDE' : 'MANANA';

          // Regla 4: Tercer intento fallido, cualquiera sea el motivo -> devolucion al comercio
          if (currentAttempts >= 3) {
            accion = 'DEVOLUCION';
            descripcion = `Tercer intento fallido alcanzado (${currentAttempts}). Marcado para devolución al comercio.`;
          } else if (event.motivo === 'AUSENTE') {
            // Regla 1: AUSENTE -> nuevo intento al dia habil siguiente en franja opuesta
            accion = 'NUEVO_INTENTO';
            const nextDay = getNextBusinessDay(occurredDate);
            nuevaFechaEstimada = nextDay.toISOString();
            franjaHoraria = franjaOpuesta;
            descripcion = `Destinatario ausente. Reprogramado para el próximo día hábil (${nextDay.toLocaleDateString()}) en franja ${franjaOpuesta}.`;
          } else if (event.motivo === 'DIRECCION_INCORRECTA') {
            // Regla 2: DIRECCION_INCORRECTA -> queda retenido hasta una correccion; no se reprograma solo
            accion = 'RETENIDO';
            descripcion = 'Dirección incorrecta. Envío retenido a la espera de confirmación de datos.';
          } else if (event.motivo === 'RECHAZADO') {
            // Regla 3: RECHAZADO -> marcado para devolucion al comercio
            accion = 'DEVOLUCION';
            descripcion = 'Envío rechazado por el destinatario. Marcado para devolución al comercio.';
          } else {
            // ZONA_INACCESIBLE u otro
            accion = 'RETENIDO';
            descripcion = `Entrega fallida por ${event.motivo}. Retenido para revisión operativa.`;
          }

          const reprogramacionEvent: EventoReprogramacion = {
            eventId: uuidv4(),
            shipmentId: event.shipmentId,
            tipo: 'REPROGRAMACION_ENVIO',
            intentoNumero: currentAttempts,
            accion,
            motivoOriginal: event.motivo,
            nuevaFechaEstimada,
            franjaHoraria,
            descripcion,
            ocurridoEn: new Date().toISOString(),
            secuencia: event.secuencia + 1,
            version: '1.0.0'
          };

          await producer.send({
            topic: TOPICS.ENVIOS_REPROGRAMACIONES,
            messages: [
              {
                key: event.shipmentId,
                value: JSON.stringify(reprogramacionEvent)
              }
            ]
          });

          console.log(
            `[${CONSUMER_GROUP}] [Observabilidad] Reprogramación emitida para ${event.shipmentId}: accion=${accion}, intento=${currentAttempts} (eventId=${event.eventId}, part=${partition}, offset=${offset})`
          );
        }
      }

      await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
    }
  });

  const shutdown = async () => {
    console.log(`[${CONSUMER_GROUP}] Cerrando conexiones...`);
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
