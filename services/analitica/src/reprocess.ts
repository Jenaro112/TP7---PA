import { Db } from 'mongodb';
import { TOPICS, createKafkaClient, EventoEstadoSchema, getCollections } from '@rutasur/shared';

export interface ReprocessResult {
  groupId: string;
  totalEventosProcesados: number;
  shipmentsEmparejados: number;
  resultadosPorHub: Record<string, {
    hubId: string;
    totalEnvios: number;
    tiempoMedioMinutos: number;
  }>;
}

export async function runHistoricalReprocess(db: Db): Promise<ReprocessResult> {
  const collections = getCollections(db);
  const newGroupId = `analitica-reproceso-${Date.now()}`;
  console.log(`[Reprocesamiento] Iniciando nuevo grupo de consumidores: ${newGroupId}`);

  const kafka = createKafkaClient(`reprocess-${Date.now()}`);
  const consumer = kafka.consumer({ groupId: newGroupId });
  const admin = kafka.admin();

  await admin.connect();
  const topicOffsets = await admin.fetchTopicOffsets(TOPICS.ENVIOS_ESTADOS);
  await admin.disconnect();

  // Offset maximo total para saber cuando terminamos
  let maxOffsetTotal = 0;
  for (const part of topicOffsets) {
    maxOffsetTotal += Number(part.high);
  }

  console.log(`[Reprocesamiento] Total mensajes a procesar en ${TOPICS.ENVIOS_ESTADOS}: ${maxOffsetTotal}`);

  if (maxOffsetTotal === 0) {
    return {
      groupId: newGroupId,
      totalEventosProcesados: 0,
      shipmentsEmparejados: 0,
      resultadosPorHub: {}
    };
  }

  await consumer.connect();
  await consumer.subscribe({
    topic: TOPICS.ENVIOS_ESTADOS,
    fromBeginning: true
  });

  const shipmentHubMap = new Map<string, { hubId: string; ingresadoHubEn?: Date; enRepartoEn?: Date }>();
  let totalEventosProcesados = 0;
  let lastMessageTime = Date.now();

  const promise = new Promise<ReprocessResult>((resolve, reject) => {
    let finished = false;

    // Timeout de inactividad: si no llegan mensajes por 3 segundos, terminamos
    const checkInactivity = setInterval(async () => {
      if (!finished && Date.now() - lastMessageTime > 3000 && totalEventosProcesados > 0) {
        clearInterval(checkInactivity);
        finished = true;
        try {
          await consumer.disconnect();

          // Calcular resultados
          const hubStats: Record<string, { total: number; totalMs: number }> = {};
          let emparejados = 0;

          for (const [_id, s] of shipmentHubMap.entries()) {
            if (s.hubId && s.ingresadoHubEn && s.enRepartoEn) {
              const diffMs = s.enRepartoEn.getTime() - s.ingresadoHubEn.getTime();
              if (diffMs > 0) {
                if (!hubStats[s.hubId]) {
                  hubStats[s.hubId] = { total: 0, totalMs: 0 };
                }
                hubStats[s.hubId].total += 1;
                hubStats[s.hubId].totalMs += diffMs;
                emparejados += 1;
              }
            }
          }

          const resultadosPorHub: Record<string, { hubId: string; totalEnvios: number; tiempoMedioMinutos: number }> = {};

          for (const [hubId, stat] of Object.entries(hubStats)) {
            const avgMinutes = Math.round((stat.totalMs / stat.total) / 60000);
            resultadosPorHub[hubId] = {
              hubId,
              totalEnvios: stat.total,
              tiempoMedioMinutos: avgMinutes
            };

            // Guardar en MongoDB
            await collections.tiempoMedioHub.updateOne(
              { hubId },
              {
                $set: {
                  hubId,
                  totalEnvios: stat.total,
                  tiempoTotalMs: stat.totalMs,
                  tiempoMedioMinutos: avgMinutes,
                  ultimaActualizacion: new Date()
                }
              },
              { upsert: true }
            );
          }

          console.log(`[Reprocesamiento] Finalizado exitosamente. Emparejados: ${emparejados}`);
          resolve({
            groupId: newGroupId,
            totalEventosProcesados,
            shipmentsEmparejados: emparejados,
            resultadosPorHub
          });
        } catch (err) {
          reject(err);
        }
      }
    }, 1000);

    consumer.run({
      autoCommit: true,
      eachMessage: async ({ message }) => {
        lastMessageTime = Date.now();
        totalEventosProcesados++;

        const raw = message.value?.toString();
        if (!raw) return;

        try {
          const payload = JSON.parse(raw);
          const parsed = EventoEstadoSchema.safeParse(payload);
          if (!parsed.success) return;

          const ev = parsed.data;
          let entry = shipmentHubMap.get(ev.shipmentId);
          if (!entry) {
            entry = { hubId: ev.hubId || 'HUB-CENTRO' };
            shipmentHubMap.set(ev.shipmentId, entry);
          }
          if (ev.hubId) entry.hubId = ev.hubId;

          if (ev.tipo === 'INGRESADO_HUB') {
            entry.ingresadoHubEn = new Date(ev.ocurridoEn);
          } else if (ev.tipo === 'EN_REPARTO') {
            entry.enRepartoEn = new Date(ev.ocurridoEn);
          }
        } catch {
          // ignorar
        }
      }
    }).catch(err => {
      clearInterval(checkInactivity);
      reject(err);
    });
  });

  return promise;
}
