import { v4 as uuidv4 } from 'uuid';
import { Producer } from 'kafkajs';
import {
  TOPICS,
  EventoEstado,
  EventoPromesa,
  EstadoEnvio,
  MotivoFallo,
  SimulatedClock
} from '@rutasur/shared';
import { PRNG } from './prng';

export const HUBS = ['HUB-NORTE', 'HUB-CENTRO', 'HUB-SUR'] as const;
export const ZONAS = ['ZONA-NORTE', 'ZONA-CENTRO', 'ZONA-ESTE', 'ZONA-OESTE', 'ZONA-SUR'] as const;
export const REPARTIDORES = ['REP-101', 'REP-102', 'REP-103', 'REP-104', 'REP-105', 'REP-106'] as const;

// Fallo configurable por zona (5% a 30%)
export const TASAS_FALLO_ZONA: Record<string, number> = {
  'ZONA-NORTE': 0.08,
  'ZONA-CENTRO': 0.12,
  'ZONA-ESTE': 0.18,
  'ZONA-OESTE': 0.24,
  'ZONA-SUR': 0.30
};

export interface SimulatorConfig {
  enviosPorMinuto: number;
  factorAceleracion: number; // 120 = 1 hora simulada = 30 seg reales
  probabilidadDemoraHub: number; // 0.10
  probabilidadDuplicado: number; // 0.02
  probabilidadFueraDeOrden: number; // 0.02
  probabilidadMalformado: number; // 0.01
  semilla: number;
  continuous: boolean;
}

export class EventGenerator {
  public config: SimulatorConfig;
  public clock: SimulatedClock;
  private prng: PRNG;
  private producer: Producer;
  private shipmentSequences: Map<string, number> = new Map();

  constructor(producer: Producer, initialConfig?: Partial<SimulatorConfig>) {
    this.producer = producer;
    this.config = {
      enviosPorMinuto: 20,
      factorAceleracion: 120, // 1h sim = 30s real
      probabilidadDemoraHub: 0.10,
      probabilidadDuplicado: 0.02,
      probabilidadFueraDeOrden: 0.02,
      probabilidadMalformado: 0.01,
      semilla: 42,
      continuous: false,
      ...initialConfig
    };

    this.prng = new PRNG(this.config.semilla);
    this.clock = new SimulatedClock(new Date(), this.config.factorAceleracion);
  }

  public setSeed(seed: number): void {
    this.config.semilla = seed;
    this.prng.setSeed(seed);
  }

  public getNextSequence(shipmentId: string): number {
    const current = this.shipmentSequences.get(shipmentId) || 0;
    const next = current + 1;
    this.shipmentSequences.set(shipmentId, next);
    return next;
  }

  public pickMotivoFallo(): MotivoFallo {
    // 60% ausente, 20% direccion, 15% rechazo, 5% zona
    const r = this.prng.next();
    if (r < 0.60) return 'AUSENTE';
    if (r < 0.80) return 'DIRECCION_INCORRECTA';
    if (r < 0.95) return 'RECHAZADO';
    return 'ZONA_INACCESIBLE';
  }

  public async emitEstado(
    shipmentId: string,
    tipo: EstadoEnvio,
    opts: {
      secuencia?: number;
      hubId?: string;
      zonaId?: string;
      repartidorId?: string;
      motivo?: MotivoFallo;
      ocurridoEn?: Date;
      eventId?: string;
    } = {}
  ): Promise<EventoEstado> {
    const seq = opts.secuencia ?? this.getNextSequence(shipmentId);
    const ocurrido = opts.ocurridoEn ?? this.clock.now();

    const event: EventoEstado = {
      eventId: opts.eventId ?? uuidv4(),
      shipmentId,
      tipo,
      ocurridoEn: ocurrido.toISOString(),
      secuencia: seq,
      hubId: opts.hubId,
      zonaId: opts.zonaId,
      repartidorId: opts.repartidorId,
      motivo: opts.motivo,
      version: '1.0.0'
    };

    await this.producer.send({
      topic: TOPICS.ENVIOS_ESTADOS,
      messages: [
        {
          key: shipmentId,
          value: JSON.stringify(event)
        }
      ]
    });

    return event;
  }

  public async emitPromesa(
    shipmentId: string,
    venceEn: Date,
    compromiso: Date = this.clock.now(),
    hubId?: string,
    zonaId?: string
  ): Promise<EventoPromesa> {
    const event: EventoPromesa = {
      eventId: uuidv4(),
      shipmentId,
      promesa: {
        compromiso: compromiso.toISOString(),
        venceEn: venceEn.toISOString(),
        hubOrigen: hubId,
        zonaDestino: zonaId
      },
      ocurridoEn: compromiso.toISOString(),
      version: '1.0.0'
    };

    await this.producer.send({
      topic: TOPICS.ENVIOS_PROMESAS,
      messages: [
        {
          key: shipmentId,
          value: JSON.stringify(event)
        }
      ]
    });

    return event;
  }

  public async emitMalformed(shipmentId: string = `MAL-${Date.now()}`): Promise<void> {
    const badPayload = {
      eventId: 'invalid-uuid-format',
      shipmentId,
      // Faltan tipo, ocurridoEn, secuencia requeridos
      mensajeInvalido: 'Evento sin esquema valido'
    };

    await this.producer.send({
      topic: TOPICS.ENVIOS_ESTADOS,
      messages: [
        {
          key: shipmentId,
          value: JSON.stringify(badPayload)
        }
      ]
    });
  }

  public getRandomHub(): string {
    return this.prng.choice(HUBS);
  }

  public getRandomZona(): string {
    return this.prng.choice(ZONAS);
  }

  public getRandomRepartidor(): string {
    return this.prng.choice(REPARTIDORES);
  }

  public shouldFailInZona(zonaId: string): boolean {
    const tasa = TASAS_FALLO_ZONA[zonaId] || 0.15;
    return this.prng.chance(tasa);
  }

  public getPRNG(): PRNG {
    return this.prng;
  }
}
