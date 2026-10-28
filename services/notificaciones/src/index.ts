import { v4 as uuidv4 } from 'uuid';
import {
  TOPICS,
  createKafkaClient,
  createProducer,
  connectMongo,
  tryMarkProcessed,
  EventoEstadoSchema,
  EventoAlertaSLASchema,
  EventoNotificacion
} from '@rutasur/shared';

const CONSUMER_GROUP = 'notificaciones';

async function main() {
  console.log(`[${CONSUMER_GROUP}] Iniciando servicio Notificaciones...`);

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

  const kafka = createKafkaClient('notificaciones');
  const producer = await createProducer(kafka);
  const consumer = kafka.consumer({
    groupId: CONSUMER_GROUP,
    retry: { retries: 5 }
  });

  await consumer.connect();
  await consumer.subscribe({
    topics: [TOPICS.ENVIOS_ESTADOS, TOPICS.ALERTAS_SLA],
    fromBeginning: false
  });

  console.log(`[${CONSUMER_GROUP}] Suscrito a ${TOPICS.ENVIOS_ESTADOS} y ${TOPICS.ALERTAS_SLA}`);

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
        // Ignorar payload no JSON en este servicio (lo maneja Proyector a DLQ)
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      if (topic === TOPICS.ENVIOS_ESTADOS) {
        const parseResult = EventoEstadoSchema.safeParse(payload);
        if (!parseResult.success) {
          await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
          return;
        }

        const event = parseResult.data;

        // Solo reaccionar a ENTREGA_FALLIDA
        if (event.tipo === 'ENTREGA_FALLIDA') {
          const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
          if (isNew) {
            const notifId = `NOTIF-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
            const notificationEvent: EventoNotificacion = {
              eventId: uuidv4(),
              notificacionId: notifId,
              shipmentId: event.shipmentId,
              tipo: 'NOTIFICACION_ENVIO_FALLIDO',
              canal: 'WHATSAPP',
              destinatario: `+54911${Math.floor(10000000 + Math.random() * 90000000)}`,
              mensaje: `Hola! No pudimos completar la entrega de tu paquete #${event.shipmentId} (Motivo: ${event.motivo}). Podés seleccionar una nueva franja horaria para tu entrega.`,
              opcionesReprogramacion: ['MANANA', 'TARDE'],
              ocurridoEn: new Date().toISOString(),
              version: '1.0.0'
            };

            await producer.send({
              topic: TOPICS.NOTIFICACIONES_ENVIADAS,
              messages: [
                {
                  key: event.shipmentId,
                  value: JSON.stringify(notificationEvent)
                }
              ]
            });

            console.log(
              `[${CONSUMER_GROUP}] [Observabilidad] Notificación enviada para ${event.shipmentId} (eventId=${event.eventId}, part=${partition}, offset=${offset})`
            );
          }
        }
      } else if (topic === TOPICS.ALERTAS_SLA) {
        const parseResult = EventoAlertaSLASchema.safeParse(payload);
        if (parseResult.success) {
          const event = parseResult.data;
          // Solo enviar notificacion para alertas abiertas con prioridad ALTA o CRITICA
          if (event.estado === 'ABIERTA' && (event.prioridad === 'ALTA' || event.prioridad === 'CRITICA')) {
            const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
            if (isNew) {
              const notifId = `NOTIF-SLA-${Date.now().toString(36).toUpperCase()}`;
              const notificationEvent: EventoNotificacion = {
                eventId: uuidv4(),
                notificacionId: notifId,
                shipmentId: event.shipmentId,
                tipo: 'NOTIFICACION_RIESGO_SLA',
                canal: 'SMS',
                destinatario: `+54911${Math.floor(10000000 + Math.random() * 90000000)}`,
                mensaje: `RutaSur informa: Tu paquete #${event.shipmentId} registra una prioridad especial de logística para asegurar su entrega puntual. Causa: ${event.causa}`,
                ocurridoEn: new Date().toISOString(),
                version: '1.0.0'
              };

              await producer.send({
                topic: TOPICS.NOTIFICACIONES_ENVIADAS,
                messages: [
                  {
                    key: event.shipmentId,
                    value: JSON.stringify(notificationEvent)
                  }
                ]
              });

              console.log(
                `[${CONSUMER_GROUP}] Notificación SLA enviada para ${event.shipmentId} (regla=${event.regla})`
              );
            }
          }
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
