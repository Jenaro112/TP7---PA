import { EventGenerator } from './generator';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class ScenarioRunner {
  private generator: EventGenerator;

  constructor(generator: EventGenerator) {
    this.generator = generator;
  }

  /**
   * Escenario 1: Envio Feliz
   * Recorre CREADO -> INGRESADO_HUB -> CLASIFICADO -> EN_REPARTO -> ENTREGADO
   */
  public async runEnvioFeliz(customId?: string, delayBetweenStepsMs: number = 300): Promise<{ shipmentId: string }> {
    const shipmentId = customId || `RS-FELIZ-${Date.now().toString(36).toUpperCase()}`;
    const hubId = this.generator.getRandomHub();
    const zonaId = this.generator.getRandomZona();
    const repartidorId = this.generator.getRandomRepartidor();

    const now = this.generator.clock.now();
    // Promesa vence en 24 horas simuladas
    const venceEn = new Date(now.getTime() + 24 * 3600 * 1000);
    await this.generator.emitPromesa(shipmentId, venceEn, now, hubId, zonaId);

    // 1. CREADO
    await this.generator.emitEstado(shipmentId, 'CREADO', { hubId, zonaId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    // 2. INGRESADO_HUB
    await this.generator.emitEstado(shipmentId, 'INGRESADO_HUB', { hubId, zonaId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    // 3. CLASIFICADO
    await this.generator.emitEstado(shipmentId, 'CLASIFICADO', { hubId, zonaId, repartidorId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    // 4. EN_REPARTO
    await this.generator.emitEstado(shipmentId, 'EN_REPARTO', { hubId, zonaId, repartidorId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    // 5. ENTREGADO
    await this.generator.emitEstado(shipmentId, 'ENTREGADO', { hubId, zonaId, repartidorId });

    return { shipmentId };
  }

  /**
   * Escenario 2: Ausente
   * Recorre estados hasta EN_REPARTO y falla con motivo AUSENTE.
   * Esto dispara la reaccion de Notificaciones, Reprogramacion y Analitica.
   */
  public async runAusente(customId?: string, delayBetweenStepsMs: number = 300): Promise<{ shipmentId: string }> {
    const shipmentId = customId || `RS-AUS-${Date.now().toString(36).toUpperCase()}`;
    const hubId = this.generator.getRandomHub();
    const zonaId = this.generator.getRandomZona();
    const repartidorId = this.generator.getRandomRepartidor();

    const now = this.generator.clock.now();
    const venceEn = new Date(now.getTime() + 24 * 3600 * 1000);
    await this.generator.emitPromesa(shipmentId, venceEn, now, hubId, zonaId);

    await this.generator.emitEstado(shipmentId, 'CREADO', { hubId, zonaId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    await this.generator.emitEstado(shipmentId, 'INGRESADO_HUB', { hubId, zonaId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    await this.generator.emitEstado(shipmentId, 'CLASIFICADO', { hubId, zonaId, repartidorId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    await this.generator.emitEstado(shipmentId, 'EN_REPARTO', { hubId, zonaId, repartidorId });
    if (delayBetweenStepsMs > 0) await sleep(delayBetweenStepsMs);

    // Falla por AUSENTE
    await this.generator.emitEstado(shipmentId, 'ENTREGA_FALLIDA', {
      hubId,
      zonaId,
      repartidorId,
      motivo: 'AUSENTE'
    });

    return { shipmentId };
  }

  /**
   * Escenario 3: Demorado
   * Queda detenido en el hub. Con la promesa de entrega fijada a poco tiempo,
   * el Monitor de SLA disparará alerta SIN_SALIDA o VENCIDO.
   */
  public async runDemorado(customId?: string, hoursToExpiry: number = 2): Promise<{ shipmentId: string }> {
    const shipmentId = customId || `RS-DEM-${Date.now().toString(36).toUpperCase()}`;
    const hubId = this.generator.getRandomHub();
    const zonaId = this.generator.getRandomZona();

    const now = this.generator.clock.now();
    // Promesa vence en hoursToExpiry horas simuladas (ej. 2 horas -> < 4h para SIN_SALIDA)
    const venceEn = new Date(now.getTime() + hoursToExpiry * 3600 * 1000);
    await this.generator.emitPromesa(shipmentId, venceEn, now, hubId, zonaId);

    await this.generator.emitEstado(shipmentId, 'CREADO', { hubId, zonaId });
    await sleep(200);

    // Queda en HUB sin salir a reparto
    await this.generator.emitEstado(shipmentId, 'INGRESADO_HUB', { hubId, zonaId });

    return { shipmentId };
  }

  /**
   * Escenario 4: Tercer Fallo
   * Envio agota sus intentos (falla 3 veces) y pasa a devolucion al comercio.
   */
  public async runTercerFallo(customId?: string): Promise<{ shipmentId: string }> {
    const shipmentId = customId || `RS-3FAL-${Date.now().toString(36).toUpperCase()}`;
    const hubId = this.generator.getRandomHub();
    const zonaId = this.generator.getRandomZona();
    const repartidorId = this.generator.getRandomRepartidor();

    const now = this.generator.clock.now();
    const venceEn = new Date(now.getTime() + 48 * 3600 * 1000);
    await this.generator.emitPromesa(shipmentId, venceEn, now, hubId, zonaId);

    // Intento 1
    await this.generator.emitEstado(shipmentId, 'CREADO', { hubId, zonaId });
    await sleep(150);
    await this.generator.emitEstado(shipmentId, 'INGRESADO_HUB', { hubId, zonaId });
    await sleep(150);
    await this.generator.emitEstado(shipmentId, 'CLASIFICADO', { hubId, zonaId, repartidorId });
    await sleep(150);
    await this.generator.emitEstado(shipmentId, 'EN_REPARTO', { hubId, zonaId, repartidorId });
    await sleep(150);
    await this.generator.emitEstado(shipmentId, 'ENTREGA_FALLIDA', { hubId, zonaId, repartidorId, motivo: 'AUSENTE' });
    await sleep(400);

    // Intento 2
    await this.generator.emitEstado(shipmentId, 'EN_REPARTO', { hubId, zonaId, repartidorId });
    await sleep(150);
    await this.generator.emitEstado(shipmentId, 'ENTREGA_FALLIDA', { hubId, zonaId, repartidorId, motivo: 'AUSENTE' });
    await sleep(400);

    // Intento 3 -> Tercer fallo! Reprogramacion debe marcar DEVOLUCION
    await this.generator.emitEstado(shipmentId, 'EN_REPARTO', { hubId, zonaId, repartidorId });
    await sleep(150);
    await this.generator.emitEstado(shipmentId, 'ENTREGA_FALLIDA', { hubId, zonaId, repartidorId, motivo: 'AUSENTE' });

    return { shipmentId };
  }

  /**
   * Escenario 5: Rafaga
   * 500 envios en pocos segundos
   */
  public async runRafaga(count: number = 500): Promise<{ count: number }> {
    console.log(`[Simulador] Iniciando rafaga de ${count} envios...`);
    const batchSize = 50;
    let completed = 0;

    for (let i = 0; i < count; i += batchSize) {
      const currentBatch = Math.min(batchSize, count - i);
      const promises = [];

      for (let j = 0; j < currentBatch; j++) {
        const id = `RS-RAF-${(completed + j + 1).toString().padStart(4, '0')}-${Date.now().toString(36)}`;
        promises.push(this.runEnvioFeliz(id, 0));
      }

      await Promise.all(promises);
      completed += currentBatch;
      await sleep(100);
    }

    console.log(`[Simulador] Rafaga de ${count} envios completada.`);
    return { count };
  }

  /**
   * Escenario 6: Evento Malformado (prueba DLQ)
   */
  public async runMalformado(): Promise<{ shipmentId: string }> {
    const shipmentId = `RS-MAL-${Date.now().toString(36).toUpperCase()}`;
    await this.generator.emitMalformed(shipmentId);
    return { shipmentId };
  }
}
