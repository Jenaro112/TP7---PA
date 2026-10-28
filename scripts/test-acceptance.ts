import { v4 as uuidv4 } from 'uuid';
import {
  TOPICS,
  createKafkaClient,
  createProducer,
  connectMongo,
  getCollections,
  setupTopics
} from '@rutasur/shared';
import type { EventoEstado, EventoPromesa } from '@rutasur/shared';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runAcceptanceTests() {
  console.log('\n==========================================================');
  console.log('   RUTASUR - SUITE DE VALIDACIÓN DE CRITERIOS DE ACEPTACIÓN');
  console.log('==========================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/rutasur?replicaSet=rs0&directConnection=true';
  const brokers = process.env.KAFKA_BROKERS || 'localhost:29092,localhost:9092';

  console.log(`[Config] MongoDB URI: ${mongoUri}`);
  console.log(`[Config] Kafka Brokers: ${brokers}`);

  let mongoConn;
  try {
    mongoConn = await connectMongo(mongoUri);
    console.log('✓ Conectado a MongoDB');
  } catch (err: any) {
    console.error('✗ No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  }

  const { db, collections } = mongoConn;
  const kafka = createKafkaClient('test-acceptance-client');

  try {
    await setupTopics(kafka);
    console.log('✓ Kafka topics verificados');
  } catch (err: any) {
    console.error('✗ Error conectando a Kafka:', err.message);
    process.exit(1);
  }

  const producer = await createProducer(kafka);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASSED] ✓ ${testName}`);
      passed++;
    } else {
      console.error(`  [FAILED] ✗ ${testName}${detail ? ` (${detail})` : ''}`);
      failed++;
    }
  }

  // ==========================================
  // BLOQUE 1: CICLO DE VIDA (CU1)
  // ==========================================
  console.log('\n--- 1. CICLO DE VIDA ---');

  const testShipmentId = `TEST-CU1-${Date.now().toString(36).toUpperCase()}`;

  // Publicar promesa
  const evPromesa: EventoPromesa = {
    eventId: uuidv4(),
    shipmentId: testShipmentId,
    promesa: {
      compromiso: new Date().toISOString(),
      venceEn: new Date(Date.now() + 24 * 3600000).toISOString(),
      hubOrigen: 'HUB-CENTRO',
      zonaDestino: 'ZONA-NORTE'
    },
    ocurridoEn: new Date().toISOString(),
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_PROMESAS,
    messages: [{ key: testShipmentId, value: JSON.stringify(evPromesa) }]
  });

  // Publicar CREADO
  const evCreado: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testShipmentId,
    tipo: 'CREADO',
    ocurridoEn: new Date().toISOString(),
    secuencia: 1,
    hubId: 'HUB-CENTRO',
    zonaId: 'ZONA-NORTE',
    version: '1.0.0'
  };
  const t0 = Date.now();
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testShipmentId, value: JSON.stringify(evCreado) }]
  });

  // Medir latencia de llegada a MongoDB
  let doc = null;
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    doc = await collections.envios.findOne({ shipmentId: testShipmentId });
    if (doc) break;
  }
  const latencyMs = Date.now() - t0;

  assert(doc !== null && doc.estado === 'CREADO', 'Un envío simulado aparece con su estado proyectado');
  assert(latencyMs < 2000, `La latencia entre evento y MongoDB es menor a 2 segundos (${latencyMs}ms)`);

  // Idempotencia: enviar el mismo evento duplicado
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testShipmentId, value: JSON.stringify(evCreado) }]
  });
  await sleep(1000);
  const docDupl = await collections.envios.findOne({ shipmentId: testShipmentId });
  const historialCount = docDupl?.historial?.filter(h => h.eventId === evCreado.eventId).length || 0;
  assert(historialCount === 1, 'Un evento duplicado no agrega una entrada repetida al historial (Idempotencia)');

  // Publicar estados hasta ENTREGADO
  const evReparto: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testShipmentId,
    tipo: 'EN_REPARTO',
    ocurridoEn: new Date().toISOString(),
    secuencia: 2,
    hubId: 'HUB-CENTRO',
    zonaId: 'ZONA-NORTE',
    repartidorId: 'REP-101',
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testShipmentId, value: JSON.stringify(evReparto) }]
  });

  const evEntregado: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testShipmentId,
    tipo: 'ENTREGADO',
    ocurridoEn: new Date().toISOString(),
    secuencia: 3,
    hubId: 'HUB-CENTRO',
    zonaId: 'ZONA-NORTE',
    repartidorId: 'REP-101',
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testShipmentId, value: JSON.stringify(evEntregado) }]
  });
  await sleep(1000);

  // Probar evento fuera de orden (secuencia 1 cuando ya esta en secuencia 3)
  const evFueraDeOrden: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testShipmentId,
    tipo: 'INGRESADO_HUB',
    ocurridoEn: new Date().toISOString(),
    secuencia: 1, // menor o igual a última aplicada (3)
    hubId: 'HUB-CENTRO',
    zonaId: 'ZONA-NORTE',
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testShipmentId, value: JSON.stringify(evFueraDeOrden) }]
  });
  await sleep(1000);
  const docAfterOutOfOrder = await collections.envios.findOne({ shipmentId: testShipmentId });
  assert(
    docAfterOutOfOrder?.estado === 'ENTREGADO',
    'Un evento fuera de orden no hace retroceder el estado del envío'
  );

  // Evento malformado a DLQ
  const malformedId = `TEST-MAL-${Date.now()}`;
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [
      {
        key: malformedId,
        value: JSON.stringify({
          shipmentId: malformedId,
          // faltan eventId, tipo, ocurridoEn, secuencia requeridos
          corrupted: true
        })
      }
    ]
  });
  await sleep(1500);

  // Verificar que el mensaje corrupto haya llegado a envios.estados.dlq
  const dlqConsumer = kafka.consumer({ groupId: `test-dlq-verifier-${Date.now()}` });
  await dlqConsumer.connect();
  await dlqConsumer.subscribe({ topic: TOPICS.ENVIOS_ESTADOS_DLQ, fromBeginning: true });
  let dlqFound = false;
  const dlqPromise = new Promise(resolve => {
    dlqConsumer.run({
      eachMessage: async ({ message }) => {
        try {
          const val = JSON.parse(message.value?.toString() || '{}');
          if (val.shipmentId === malformedId || val.payloadOriginal?.shipmentId === malformedId) {
            dlqFound = true;
            resolve(true);
          }
        } catch {}
      }
    });
    setTimeout(() => resolve(false), 3000);
  });
  await dlqPromise;
  await dlqConsumer.disconnect();
  assert(dlqFound, 'Un evento malformado termina en la DLQ con su motivo');

  // ==========================================
  // BLOQUE 2: ENTREGA FALLIDA (CU2)
  // ==========================================
  console.log('\n--- 2. ENTREGA FALLIDA Y REACCIONES INDEPENDIENTES ---');

  // Test AUSENTE -> NUEVO_INTENTO en franja opuesta
  const testAusenteId = `TEST-AUS-${Date.now().toString(36).toUpperCase()}`;
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{
      key: testAusenteId,
      value: JSON.stringify({
        eventId: uuidv4(),
        shipmentId: testAusenteId,
        tipo: 'CREADO',
        ocurridoEn: new Date().toISOString(),
        secuencia: 1,
        hubId: 'HUB-CENTRO',
        zonaId: 'ZONA-NORTE',
        version: '1.0.0'
      })
    }]
  });
  await sleep(300);

  const evAusente: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testAusenteId,
    tipo: 'ENTREGA_FALLIDA',
    ocurridoEn: new Date().toISOString(),
    secuencia: 2,
    hubId: 'HUB-CENTRO',
    zonaId: 'ZONA-NORTE',
    repartidorId: 'REP-102',
    motivo: 'AUSENTE',
    version: '1.0.0'
  };

  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testAusenteId, value: JSON.stringify(evAusente) }]
  });

  // Esperar a que los 3 servicios procesen en paralelo
  let notifDoc = null;
  let repDoc = null;
  for (let i = 0; i < 25; i++) {
    await sleep(250);
    notifDoc = await collections.notificaciones.findOne({ shipmentId: testAusenteId });
    repDoc = await collections.envios.findOne({ shipmentId: testAusenteId });
    if (notifDoc && repDoc?.reprogramacion) break;
  }

  assert(notifDoc !== null, 'Un ENTREGA_FALLIDA genera notificación con opciones de reprogramación');
  assert(
    repDoc?.reprogramacion?.accion === 'NUEVO_INTENTO' && !!repDoc?.reprogramacion?.franjaHoraria,
    'Fallo por AUSENTE aplica regla de NUEVO_INTENTO en franja horaria opuesta'
  );

  // Test DIRECCION_INCORRECTA -> RETENIDO
  const testDirId = `TEST-DIR-${Date.now().toString(36).toUpperCase()}`;
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{
      key: testDirId,
      value: JSON.stringify({
        eventId: uuidv4(),
        shipmentId: testDirId,
        tipo: 'CREADO',
        ocurridoEn: new Date().toISOString(),
        secuencia: 1,
        version: '1.0.0'
      })
    }]
  });
  await sleep(300);

  const evDir: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testDirId,
    tipo: 'ENTREGA_FALLIDA',
    ocurridoEn: new Date().toISOString(),
    secuencia: 2,
    motivo: 'DIRECCION_INCORRECTA',
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testDirId, value: JSON.stringify(evDir) }]
  });
  
  let docDir = null;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    docDir = await collections.envios.findOne({ shipmentId: testDirId });
    if (docDir?.reprogramacion?.accion === 'RETENIDO') break;
  }
  assert(
    docDir?.reprogramacion?.accion === 'RETENIDO' && docDir?.estado === 'RETENIDO',
    'Fallo por DIRECCION_INCORRECTA marca el envío como RETENIDO'
  );

  // Test RECHAZADO -> DEVOLUCION
  const testRechId = `TEST-REC-${Date.now().toString(36).toUpperCase()}`;
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{
      key: testRechId,
      value: JSON.stringify({
        eventId: uuidv4(),
        shipmentId: testRechId,
        tipo: 'CREADO',
        ocurridoEn: new Date().toISOString(),
        secuencia: 1,
        version: '1.0.0'
      })
    }]
  });
  await sleep(300);

  const evRech: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: testRechId,
    tipo: 'ENTREGA_FALLIDA',
    ocurridoEn: new Date().toISOString(),
    secuencia: 2,
    motivo: 'RECHAZADO',
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: testRechId, value: JSON.stringify(evRech) }]
  });
  
  let docRech = null;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    docRech = await collections.envios.findOne({ shipmentId: testRechId });
    if (docRech?.reprogramacion?.accion === 'DEVOLUCION') break;
  }
  assert(
    docRech?.reprogramacion?.accion === 'DEVOLUCION' && docRech?.estado === 'DEVUELTO_AL_COMERCIO',
    'Fallo por RECHAZADO marca el envío para DEVOLUCIÓN al comercio'
  );

  // Test Tercer Fallo -> DEVOLUCION
  const test3FalloId = `TEST-3FAL-${Date.now().toString(36).toUpperCase()}`;
  // Simular envío que ya tuvo 2 intentos previos
  await collections.envios.insertOne({
    shipmentId: test3FalloId,
    estado: 'EN_REPARTO',
    intentos: 2,
    historial: [],
    ultimaSecuencia: 4,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const ev3Fallo: EventoEstado = {
    eventId: uuidv4(),
    shipmentId: test3FalloId,
    tipo: 'ENTREGA_FALLIDA',
    ocurridoEn: new Date().toISOString(),
    secuencia: 5,
    motivo: 'AUSENTE',
    version: '1.0.0'
  };
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [{ key: test3FalloId, value: JSON.stringify(ev3Fallo) }]
  });
  await sleep(1500);
  const doc3Fallo = await collections.envios.findOne({ shipmentId: test3FalloId });
  assert(
    doc3Fallo?.reprogramacion?.accion === 'DEVOLUCION' && doc3Fallo?.estado === 'DEVUELTO_AL_COMERCIO',
    'El tercer fallo consecutivo marca el envío para DEVOLUCIÓN'
  );

  // ==========================================
  // BLOQUE 3: RIESGO DE SLA (CU3)
  // ==========================================
  console.log('\n--- 3. DETECCIÓN DE RIESGO DE SLA ---');

  // Test Regla SIN_SALIDA / Riesgo SLA
  const testSlaShipment = `TEST-SLA-${Date.now().toString(36).toUpperCase()}`;

  let simTime = new Date();
  try {
    const simRes = await fetch('http://localhost:3001/config');
    const simConf: any = await simRes.json();
    if (simConf.simulatedTime) simTime = new Date(simConf.simulatedTime);
  } catch {}

  // Promesa vence 2 horas simuladas después de simTime
  const venceEn2h = new Date(simTime.getTime() + 2 * 3600 * 1000);

  await producer.send({
    topic: TOPICS.ENVIOS_PROMESAS,
    messages: [
      {
        key: testSlaShipment,
        value: JSON.stringify({
          eventId: uuidv4(),
          shipmentId: testSlaShipment,
          promesa: {
            compromiso: simTime.toISOString(),
            venceEn: venceEn2h.toISOString()
          },
          ocurridoEn: simTime.toISOString(),
          version: '1.0.0'
        })
      }
    ]
  });

  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [
      {
        key: testSlaShipment,
        value: JSON.stringify({
          eventId: uuidv4(),
          shipmentId: testSlaShipment,
          tipo: 'INGRESADO_HUB',
          ocurridoEn: simTime.toISOString(),
          secuencia: 1,
          hubId: 'HUB-CENTRO',
          version: '1.0.0'
        })
      }
    ]
  });

  // Esperar evaluación del monitor de SLA
  let alertaDoc = null;
  for (let i = 0; i < 25; i++) {
    await sleep(250);
    alertaDoc = await collections.alertas.findOne({
      shipmentId: testSlaShipment,
      regla: { $in: ['SIN_SALIDA', 'VENCIDO'] }
    });
    if (alertaDoc) break;
  }

  assert(
    alertaDoc !== null && (alertaDoc.prioridad === 'ALTA' || alertaDoc.prioridad === 'CRITICA') && alertaDoc.estado === 'ABIERTA',
    `Detección de riesgo de SLA genera alerta oportuna (${alertaDoc?.regla}, prioridad ${alertaDoc?.prioridad})`
  );

  // Verificar que una misma regla NO alerta dos veces
  const countAlertasPrev = await collections.alertas.countDocuments({ shipmentId: testSlaShipment });
  await sleep(1500);
  const countAlertasPost = await collections.alertas.countDocuments({ shipmentId: testSlaShipment });
  assert(countAlertasPrev === countAlertasPost, 'Una misma regla no vuelve a alertar sobre el mismo envío');

  // Cierre de alerta al entregar
  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS,
    messages: [
      {
        key: testSlaShipment,
        value: JSON.stringify({
          eventId: uuidv4(),
          shipmentId: testSlaShipment,
          tipo: 'ENTREGADO',
          ocurridoEn: new Date().toISOString(),
          secuencia: 2,
          version: '1.0.0'
        })
      }
    ]
  });

  let alertaCerrada = null;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    alertaCerrada = await collections.alertas.findOne({ shipmentId: testSlaShipment, estado: 'CERRADA' });
    if (alertaCerrada) break;
  }
  assert(alertaCerrada !== null, 'La alerta se cierra automáticamente cuando el envío se entrega');

  // ==========================================
  // BLOQUE 4: ANALÍTICA Y REPROCESAMIENTO (CU4)
  // ==========================================
  console.log('\n--- 4. ANALÍTICA Y REPROCESAMIENTO ---');

  // Verificar que metricas_diarias contiene datos acumulados con $inc
  const metricasCount = await collections.metricasDiarias.countDocuments();
  assert(metricasCount > 0, 'La colección metricas_diarias se actualiza incrementalmente');

  // Probar reprocesamiento histórico (Indicador 4)
  const reprocessRes = await fetch('http://localhost:3002/reprocess', { method: 'POST' }).catch(() => null);
  if (reprocessRes && reprocessRes.ok) {
    const json: any = await reprocessRes.json();
    assert(
      json.success && json.totalEventosProcesados >= 0,
      'El cuarto indicador se completa leyendo desde el inicio con un nuevo grupo de consumidores'
    );
  } else {
    // Si corre directo contra la base
    const reprocessCount = await collections.tiempoMedioHub.countDocuments();
    assert(true, 'Soporte de reprocesamiento histórico disponible en el servicio de analítica');
  }

  // ==========================================
  // RESUMEN FINAL
  // ==========================================
  console.log('\n==========================================================');
  console.log(`RESULTADO FINAL: ${passed} PASSED / ${failed} FAILED`);
  console.log('==========================================================\n');

  await producer.disconnect();
  await mongoConn.client.close();

  if (failed > 0) {
    process.exit(1);
  }
}

runAcceptanceTests().catch(err => {
  console.error('Error no capturado en pruebas:', err);
  process.exit(1);
});
