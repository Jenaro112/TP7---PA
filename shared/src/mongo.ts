import { MongoClient, Db, Collection } from 'mongodb';
import { EstadoEnvio, MotivoFallo, ReglaSLA, PrioridadAlerta, EstadoAlerta, FranjaHoraria, AccionReprogramacion } from './events';

export interface EnvioDocument {
  shipmentId: string;
  estado: EstadoEnvio | 'RETENIDO' | 'DEVUELTO_AL_COMERCIO';
  hubId?: string;
  zonaId?: string;
  repartidorId?: string;
  promesa?: {
    compromiso: Date;
    venceEn: Date;
  };
  intentos: number;
  historial: Array<{
    eventId: string;
    tipo: string;
    ocurridoEn: Date;
    secuencia: number;
    hubId?: string;
    zonaId?: string;
    repartidorId?: string;
    motivo?: MotivoFallo;
    detalles?: Record<string, any>;
  }>;
  ultimaSecuencia: number;
  reprogramacion?: {
    intentoNumero: number;
    accion: AccionReprogramacion;
    motivoOriginal?: MotivoFallo;
    nuevaFechaEstimada?: Date;
    franjaHoraria?: FranjaHoraria;
    descripcion: string;
    actualizadoEn: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertaDocument {
  alertaId: string;
  shipmentId: string;
  regla: ReglaSLA;
  prioridad: PrioridadAlerta;
  estado: EstadoAlerta;
  causa: string;
  creadaEn: Date;
  cerradaEn?: Date;
  ocurridoEn: Date;
}

export interface NotificacionDocument {
  notificacionId: string;
  shipmentId: string;
  canal: 'EMAIL' | 'SMS' | 'WHATSAPP';
  destinatario: string;
  mensaje: string;
  opcionesReprogramacion?: string[];
  ocurridoEn: Date;
}

export interface MetricasDiariasDocument {
  fecha: string; // YYYY-MM-DD
  zonaId: string;
  franja: string; // 'MANANA' | 'TARDE' or hour range
  hubId?: string;
  totalEnvios: number;
  entregasPrimerIntento: number;
  entregasFallidas: number;
  entregadosTotal: number;
  motivosFallo: {
    AUSENTE: number;
    DIRECCION_INCORRECTA: number;
    RECHAZADO: number;
    ZONA_INACCESIBLE: number;
  };
  cumplimientoSla: {
    cumplidos: number;
    fallidos: number;
  };
}

export interface EventoProcesadoDocument {
  consumidor: string;
  eventId: string;
  procesadoEn: Date;
}

export interface RutaSurCollections {
  envios: Collection<EnvioDocument>;
  alertas: Collection<AlertaDocument>;
  notificaciones: Collection<NotificacionDocument>;
  metricasDiarias: Collection<MetricasDiariasDocument>;
  eventosProcesados: Collection<EventoProcesadoDocument>;
  tiempoMedioHub: Collection<{
    hubId: string;
    totalEnvios: number;
    tiempoTotalMs: number;
    tiempoMedioMinutos: number;
    ultimaActualizacion: Date;
  }>;
}

export function getCollections(db: Db): RutaSurCollections {
  return {
    envios: db.collection<EnvioDocument>('envios'),
    alertas: db.collection<AlertaDocument>('alertas'),
    notificaciones: db.collection<NotificacionDocument>('notificaciones'),
    metricasDiarias: db.collection<MetricasDiariasDocument>('metricas_diarias'),
    eventosProcesados: db.collection<EventoProcesadoDocument>('eventos_procesados'),
    tiempoMedioHub: db.collection('metricas_tiempo_hub')
  };
}

export async function connectMongo(uri?: string): Promise<{ client: MongoClient; db: Db; collections: RutaSurCollections }> {
  const mongoUri = uri || process.env.MONGO_URI || 'mongodb://localhost:27017/rutasur?replicaSet=rs0&directConnection=true';
  const client = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db();
  const collections = getCollections(db);

  return { client, db, collections };
}

export async function ensureIndexes(db: Db): Promise<void> {
  const collections = getCollections(db);

  // envios: shipmentId unico, estado + zonaId, promesa.venceEn
  await collections.envios.createIndex({ shipmentId: 1 }, { unique: true });
  await collections.envios.createIndex({ estado: 1, zonaId: 1 });
  await collections.envios.createIndex({ 'promesa.venceEn': 1 });

  // alertas: estado + prioridad, shipmentId
  await collections.alertas.createIndex({ estado: 1, prioridad: 1 });
  await collections.alertas.createIndex({ shipmentId: 1 });
  await collections.alertas.createIndex({ shipmentId: 1, regla: 1 });

  // notificaciones: shipmentId
  await collections.notificaciones.createIndex({ shipmentId: 1 });

  // metricas_diarias: fecha + zonaId + franja unico
  await collections.metricasDiarias.createIndex(
    { fecha: 1, zonaId: 1, franja: 1 },
    { unique: true }
  );

  // eventos_procesados: consumidor + eventId unico, procesadoEn TTL 7 dias (604800 seg)
  await collections.eventosProcesados.createIndex(
    { consumidor: 1, eventId: 1 },
    { unique: true }
  );
  await collections.eventosProcesados.createIndex(
    { procesadoEn: 1 },
    { expireAfterSeconds: 7 * 24 * 3600 }
  );

  // metricas_tiempo_hub: hubId unico
  await collections.tiempoMedioHub.createIndex({ hubId: 1 }, { unique: true });
}

/**
 * Idempotency check: tries to insert an entry into eventos_procesados.
 * Returns true if new (not processed yet).
 * Returns false if duplicate (already processed).
 */
export async function tryMarkProcessed(
  db: Db,
  consumidor: string,
  eventId: string
): Promise<boolean> {
  try {
    await db.collection<EventoProcesadoDocument>('eventos_procesados').insertOne({
      consumidor,
      eventId,
      procesadoEn: new Date()
    });
    return true;
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate key error
      return false;
    }
    throw err;
  }
}
