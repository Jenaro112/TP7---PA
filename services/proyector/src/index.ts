import {
  TOPICS,
  createKafkaClient,
  createProducer,
  connectMongo,
  ensureIndexes,
  tryMarkProcessed,
  sendDLQ,
  EventoEstadoSchema,
  EventoReprogramacionSchema,
  EventoAlertaSLASchema,
  EventoNotificacionSchema,
  EnvioDocument
} from '@rutasur/shared';

const CONSUMER_GROUP = 'proyector';

async function main() {
  console.log(`[${CONSUMER_GROUP}] Iniciando servicio Proyector...`);

  // Conectar a MongoDB
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
  await ensureIndexes(db);
  console.log(`[${CONSUMER_GROUP}] Conectado a MongoDB y verificados índices.`);

  // Conectar a Kafka
  const kafka = createKafkaClient('proyector');
  const producer = await createProducer(kafka);
  const consumer = kafka.consumer({
    groupId: CONSUMER_GROUP,
    retry: { retries: 5 }
  });

  await consumer.connect();
  await consumer.subscribe({
    topics: [
      TOPICS.ENVIOS_ESTADOS,
      TOPICS.ENVIOS_REPROGRAMACIONES,
      TOPICS.ALERTAS_SLA,
      TOPICS.NOTIFICACIONES_ENVIADAS
    ],
    fromBeginning: true
  });

  console.log(`[${CONSUMER_GROUP}] Consumidor suscrito a los 4 topics.`);

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const offset = message.offset;
      const rawValue = message.value?.toString();

      if (!rawValue) {
        // Mensaje vacio/tombstone -> comitear
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      let payload: any;
      try {
        payload = JSON.parse(rawValue);
      } catch (err: any) {
        // JSON invalido -> enviar a DLQ
        await sendDLQ(producer, {
          topicOrigen: topic,
          payloadOriginal: rawValue,
          error: `JSON malformado: ${err.message}`,
          consumidor: CONSUMER_GROUP
        });
        await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
        return;
      }

      // Validar segun topic
      if (topic === TOPICS.ENVIOS_ESTADOS) {
        const parseResult = EventoEstadoSchema.safeParse(payload);
        if (!parseResult.success) {
          // Esquema invalido -> mandar a DLQ y continuar
          await sendDLQ(producer, {
            shipmentId: payload?.shipmentId,
            topicOrigen: topic,
            payloadOriginal: payload,
            error: `Esquema invalido: ${parseResult.error.message}`,
            consumidor: CONSUMER_GROUP
          });
          await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
          return;
        }

        const event = parseResult.data;

        // Idempotencia: descartar si eventId ya fue procesado por este consumidor
        const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
        if (!isNew) {
          console.log(`[${CONSUMER_GROUP}] Evento duplicado ignorado (eventId=${event.eventId}, shipmentId=${event.shipmentId})`);
          await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
          return;
        }

        // Obtener estado actual del envio para verificar regla de secuencia
        const currentDoc = await collections.envios.findOne({ shipmentId: event.shipmentId });
        const lastSeq = currentDoc?.ultimaSecuencia ?? 0;

        const isOutOfOrder = currentDoc && event.secuencia <= lastSeq;
        if (isOutOfOrder) {
          console.warn(
            `[${CONSUMER_GROUP}] Evento fuera de orden descartado para estado actual: seq=${event.secuencia} <= lastSeq=${lastSeq} (shipmentId=${event.shipmentId})`
          );
          // No actualizamos estado ni ultimaSecuencia, pero comiteamos offset
          await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
          return;
        }

        // Construir registro de historial
        const historyEntry = {
          eventId: event.eventId,
          tipo: event.tipo,
          ocurridoEn: new Date(event.ocurridoEn),
          secuencia: event.secuencia,
          hubId: event.hubId,
          zonaId: event.zonaId,
          repartidorId: event.repartidorId,
          motivo: event.motivo
        };

        const setOnInsertDoc: any = {
          createdAt: new Date()
        };
        if (event.tipo !== 'ENTREGA_FALLIDA') {
          setOnInsertDoc.intentos = 0;
        }

        const updateDoc: any = {
          $set: {
            estado: event.tipo,
            ultimaSecuencia: event.secuencia,
            updatedAt: new Date()
          },
          $push: {
            historial: {
              $each: [historyEntry],
              $slice: -15 // Mantener acotado (menos de 15 eventos)
            }
          },
          $setOnInsert: setOnInsertDoc
        };

        if (event.hubId) updateDoc.$set.hubId = event.hubId;
        if (event.zonaId) updateDoc.$set.zonaId = event.zonaId;
        if (event.repartidorId) updateDoc.$set.repartidorId = event.repartidorId;

        if (event.tipo === 'ENTREGA_FALLIDA') {
          updateDoc.$inc = { intentos: 1 };
        }

        await collections.envios.updateOne(
          { shipmentId: event.shipmentId },
          updateDoc,
          { upsert: true }
        );

        console.log(
          `[${CONSUMER_GROUP}] [Observabilidad] Procesado ${event.tipo} (eventId=${event.eventId}, shipment=${event.shipmentId}, part=${partition}, offset=${offset})`
        );
      } else if (topic === TOPICS.ENVIOS_REPROGRAMACIONES) {
        const parseResult = EventoReprogramacionSchema.safeParse(payload);
        if (parseResult.success) {
          const event = parseResult.data;
          const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
          if (isNew) {
            const updateDoc: any = {
              $set: {
                reprogramacion: {
                  intentoNumero: event.intentoNumero,
                  accion: event.accion,
                  motivoOriginal: event.motivoOriginal,
                  nuevaFechaEstimada: event.nuevaFechaEstimada ? new Date(event.nuevaFechaEstimada) : undefined,
                  franjaHoraria: event.franjaHoraria,
                  descripcion: event.descripcion,
                  actualizadoEn: new Date()
                },
                updatedAt: new Date()
              },
              $push: {
                historial: {
                  $each: [{
                    eventId: event.eventId,
                    tipo: `REPROGRAMACION_${event.accion}`,
                    ocurridoEn: new Date(event.ocurridoEn),
                    secuencia: event.secuencia || 99,
                    detalles: { accion: event.accion, franja: event.franjaHoraria }
                  }],
                  $slice: -15
                }
              }
            };

            // Si la accion es RETENIDO o DEVOLUCION, actualizar estado del envio
            if (event.accion === 'RETENIDO') {
              updateDoc.$set.estado = 'RETENIDO';
            } else if (event.accion === 'DEVOLUCION') {
              updateDoc.$set.estado = 'DEVUELTO_AL_COMERCIO';
            }

            await collections.envios.updateOne(
              { shipmentId: event.shipmentId },
              updateDoc
            );
          }
        }
      } else if (topic === TOPICS.ALERTAS_SLA) {
        const parseResult = EventoAlertaSLASchema.safeParse(payload);
        if (parseResult.success) {
          const event = parseResult.data;
          const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
          if (isNew) {
            await collections.alertas.updateOne(
              { alertaId: event.alertaId },
              {
                $set: {
                  alertaId: event.alertaId,
                  shipmentId: event.shipmentId,
                  regla: event.regla,
                  prioridad: event.prioridad,
                  estado: event.estado,
                  causa: event.causa,
                  ocurridoEn: new Date(event.ocurridoEn),
                  cerradaEn: event.cerradaEn ? new Date(event.cerradaEn) : undefined
                },
                $setOnInsert: {
                  creadaEn: new Date()
                }
              },
              { upsert: true }
            );
          }
        }
      } else if (topic === TOPICS.NOTIFICACIONES_ENVIADAS) {
        const parseResult = EventoNotificacionSchema.safeParse(payload);
        if (parseResult.success) {
          const event = parseResult.data;
          const isNew = await tryMarkProcessed(db, CONSUMER_GROUP, event.eventId);
          if (isNew) {
            await collections.notificaciones.insertOne({
              notificacionId: event.notificacionId,
              shipmentId: event.shipmentId,
              canal: event.canal,
              mensaje: event.mensaje,
              destinatario: event.destinatario,
              opcionesReprogramacion: event.opcionesReprogramacion,
              ocurridoEn: new Date(event.ocurridoEn)
            });
          }
        }
      }

      // Manual commit offset after write
      await consumer.commitOffsets([{ topic, partition, offset: (Number(offset) + 1).toString() }]);
    }
  });

  // Graceful shutdown
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
