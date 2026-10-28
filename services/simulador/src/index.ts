import express from 'express';
import cors from 'cors';
import { createKafkaClient, createProducer, setupTopics } from '@rutasur/shared';
import { EventGenerator } from './generator';
import { ScenarioRunner } from './scenarios';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function main() {
  const kafka = createKafkaClient('simulador');

  console.log('[Simulador] Conectando a Kafka y verificando topics...');
  let connected = false;
  let attempts = 0;
  while (!connected && attempts < 15) {
    try {
      attempts++;
      await setupTopics(kafka);
      connected = true;
    } catch (e: any) {
      console.warn(`[Simulador] Kafka no disponible aún (intento ${attempts}/15). Reintentando en 3s...`, e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  const producer = await createProducer(kafka);
  console.log('[Simulador] Productor Kafka conectado exitosamente.');

  const generator = new EventGenerator(producer);
  const scenarios = new ScenarioRunner(generator);

  // Background continuous loop
  let continuousTimer: NodeJS.Timeout | null = null;

  const startContinuous = () => {
    if (continuousTimer) return;
    generator.config.continuous = true;
    console.log(`[Simulador] Iniciando flujo continuo: ${generator.config.enviosPorMinuto} envíos/min`);

    const intervalMs = Math.max(500, Math.floor(60000 / generator.config.enviosPorMinuto));

    continuousTimer = setInterval(async () => {
      try {
        const shipmentId = `RS-${Date.now().toString(36).toUpperCase()}-${Math.floor(generator.getPRNG().next() * 1000)}`;
        const hubId = generator.getRandomHub();
        const zonaId = generator.getRandomZona();
        const repartidorId = generator.getRandomRepartidor();

        const willFail = generator.shouldFailInZona(zonaId);
        const willDelayInHub = generator.getPRNG().chance(generator.config.probabilidadDemoraHub);
        const willDuplicate = generator.getPRNG().chance(generator.config.probabilidadDuplicado);
        const willOutOfOrder = generator.getPRNG().chance(generator.config.probabilidadFueraDeOrden);
        const willMalformed = generator.getPRNG().chance(generator.config.probabilidadMalformado);

        if (willMalformed) {
          await generator.emitMalformed();
          return;
        }

        const now = generator.clock.now();
        // Vencimiento SLA: normal 24h, o si hay demora en hub 3h (dispara SIN_SALIDA)
        const horasPromesa = willDelayInHub ? 3 : 24;
        const venceEn = new Date(now.getTime() + horasPromesa * 3600 * 1000);
        await generator.emitPromesa(shipmentId, venceEn, now, hubId, zonaId);

        // 1. CREADO
        const evCreado = await generator.emitEstado(shipmentId, 'CREADO', { hubId, zonaId });

        if (willDuplicate) {
          // Reenviar mismo evento id y secuencia (prueba idempotencia)
          await generator.emitEstado(shipmentId, 'CREADO', {
            eventId: evCreado.eventId,
            secuencia: evCreado.secuencia,
            hubId,
            zonaId
          });
        }

        // 2. INGRESADO_HUB
        await generator.emitEstado(shipmentId, 'INGRESADO_HUB', { hubId, zonaId });

        if (willDelayInHub) {
          // Queda retenido en el hub para disparar alerta SLA
          return;
        }

        // 3. CLASIFICADO
        await generator.emitEstado(shipmentId, 'CLASIFICADO', { hubId, zonaId, repartidorId });

        if (willOutOfOrder) {
          // Enviar un evento con secuencia menor (prueba regla de secuencia)
          await generator.emitEstado(shipmentId, 'INGRESADO_HUB', {
            secuencia: 1, // secuencia menor ya aplicada
            hubId,
            zonaId
          });
        }

        // 4. EN_REPARTO
        await generator.emitEstado(shipmentId, 'EN_REPARTO', { hubId, zonaId, repartidorId });

        // 5. Resultado
        if (willFail) {
          const motivo = generator.pickMotivoFallo();
          await generator.emitEstado(shipmentId, 'ENTREGA_FALLIDA', {
            hubId,
            zonaId,
            repartidorId,
            motivo
          });
        } else {
          await generator.emitEstado(shipmentId, 'ENTREGADO', { hubId, zonaId, repartidorId });
        }
      } catch (err: any) {
        console.error('[Simulador] Error en ciclo continuo:', err.message);
      }
    }, intervalMs);
  };

  const stopContinuous = () => {
    if (continuousTimer) {
      clearInterval(continuousTimer);
      continuousTimer = null;
    }
    generator.config.continuous = false;
    console.log('[Simulador] Flujo continuo detenido.');
  };

  // Express App
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'simulador' });
  });

  app.get('/config', (_req, res) => {
    res.json({
      ...generator.config,
      simulatedTime: generator.clock.now().toISOString()
    });
  });

  app.post('/config', (req, res) => {
    const { enviosPorMinuto, factorAceleracion, continuous, semilla } = req.body;
    if (typeof enviosPorMinuto === 'number' && enviosPorMinuto > 0) {
      generator.config.enviosPorMinuto = enviosPorMinuto;
    }
    if (typeof factorAceleracion === 'number' && factorAceleracion > 0) {
      generator.config.factorAceleracion = factorAceleracion;
      generator.clock.setAcceleration(factorAceleracion);
    }
    if (typeof semilla === 'number') {
      generator.setSeed(semilla);
    }
    if (typeof continuous === 'boolean') {
      if (continuous) {
        startContinuous();
      } else {
        stopContinuous();
      }
    }
    res.json({ success: true, config: generator.config });
  });

  // Escenarios
  app.post('/scenarios/feliz', async (req, res) => {
    try {
      const result = await scenarios.runEnvioFeliz(req.body?.shipmentId);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/scenarios/ausente', async (req, res) => {
    try {
      const result = await scenarios.runAusente(req.body?.shipmentId);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/scenarios/demorado', async (req, res) => {
    try {
      const result = await scenarios.runDemorado(req.body?.shipmentId, req.body?.hoursToExpiry);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/scenarios/tercer-fallo', async (req, res) => {
    try {
      const result = await scenarios.runTercerFallo(req.body?.shipmentId);
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/scenarios/rafaga', async (req, res) => {
    try {
      const count = req.body?.count || 500;
      // Correr asincrónicamente para no bloquear la respuesta HTTP
      scenarios.runRafaga(count).catch(console.error);
      res.json({ success: true, message: `Rafaga de ${count} envios iniciada.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/scenarios/malformado', async (_req, res) => {
    try {
      const result = await scenarios.runMalformado();
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/reset-clock', (req, res) => {
    const time = req.body?.time ? new Date(req.body.time) : new Date();
    generator.clock.setSimulatedTime(time);
    res.json({ success: true, simulatedTime: generator.clock.now().toISOString() });
  });

  app.listen(PORT, () => {
    console.log(`[Simulador] Servidor HTTP escuchando en puerto ${PORT}`);
  });

  // Si START_CONTINUOUS está seteado en el entorno (ej. en docker-compose)
  if (process.env.START_CONTINUOUS === 'true') {
    startContinuous();
  }
}

main().catch(err => {
  console.error('[Simulador] Error fatal:', err);
  process.exit(1);
});
