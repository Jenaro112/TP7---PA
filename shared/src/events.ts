import { z } from 'zod';

export const TOPICS = {
  ENVIOS_ESTADOS: 'envios.estados',
  ENVIOS_PROMESAS: 'envios.promesas',
  ENVIOS_REPROGRAMACIONES: 'envios.reprogramaciones',
  ALERTAS_SLA: 'alertas.sla',
  NOTIFICACIONES_ENVIADAS: 'notificaciones.enviadas',
  ENVIOS_ESTADOS_DLQ: 'envios.estados.dlq',
} as const;

export type TopicName = typeof TOPICS[keyof typeof TOPICS];

export const ESTADOS_ENVIO = [
  'CREADO',
  'INGRESADO_HUB',
  'CLASIFICADO',
  'EN_REPARTO',
  'ENTREGADO',
  'ENTREGA_FALLIDA'
] as const;
export type EstadoEnvio = typeof ESTADOS_ENVIO[number];

export const MOTIVOS_FALLO = [
  'AUSENTE',
  'DIRECCION_INCORRECTA',
  'RECHAZADO',
  'ZONA_INACCESIBLE'
] as const;
export type MotivoFallo = typeof MOTIVOS_FALLO[number];

export const REGLAS_SLA = [
  'SIN_INGRESO',
  'SIN_SALIDA',
  'FALLO_DIA_LIMITE',
  'VENCIDO'
] as const;
export type ReglaSLA = typeof REGLAS_SLA[number];

export const PRIORIDADES_ALERTA = ['MEDIA', 'ALTA', 'CRITICA'] as const;
export type PrioridadAlerta = typeof PRIORIDADES_ALERTA[number];

export const ESTADOS_ALERTA = ['ABIERTA', 'CERRADA'] as const;
export type EstadoAlerta = typeof ESTADOS_ALERTA[number];

export const ACCIONES_REPROGRAMACION = [
  'NUEVO_INTENTO',
  'RETENIDO',
  'DEVOLUCION'
] as const;
export type AccionReprogramacion = typeof ACCIONES_REPROGRAMACION[number];

export const FRANJAS_HORARIAS = ['MANANA', 'TARDE'] as const;
export type FranjaHoraria = typeof FRANJAS_HORARIAS[number];

// Schema for envios.estados
export const EventoEstadoSchema = z.object({
  eventId: z.string().uuid(),
  shipmentId: z.string().min(1),
  tipo: z.enum(ESTADOS_ENVIO),
  ocurridoEn: z.string().datetime(),
  secuencia: z.number().int().positive(),
  hubId: z.string().optional(),
  zonaId: z.string().optional(),
  repartidorId: z.string().optional(),
  motivo: z.enum(MOTIVOS_FALLO).optional(),
  version: z.string().default('1.0.0'),
  detalles: z.record(z.any()).optional()
}).refine((data) => {
  if (data.tipo === 'ENTREGA_FALLIDA' && !data.motivo) {
    return false;
  }
  return true;
}, {
  message: "ENTREGA_FALLIDA requiere un campo 'motivo' válido"
});

export type EventoEstado = z.infer<typeof EventoEstadoSchema>;

// Schema for envios.promesas
export const EventoPromesaSchema = z.object({
  eventId: z.string().uuid(),
  shipmentId: z.string().min(1),
  promesa: z.object({
    compromiso: z.string().datetime(),
    venceEn: z.string().datetime(),
    hubOrigen: z.string().optional(),
    zonaDestino: z.string().optional()
  }),
  ocurridoEn: z.string().datetime(),
  version: z.string().default('1.0.0')
});

export type EventoPromesa = z.infer<typeof EventoPromesaSchema>;

// Schema for envios.reprogramaciones
export const EventoReprogramacionSchema = z.object({
  eventId: z.string().uuid(),
  shipmentId: z.string().min(1),
  tipo: z.literal('REPROGRAMACION_ENVIO'),
  intentoNumero: z.number().int().min(1),
  accion: z.enum(ACCIONES_REPROGRAMACION),
  motivoOriginal: z.enum(MOTIVOS_FALLO).optional(),
  nuevaFechaEstimada: z.string().datetime().optional(),
  franjaHoraria: z.enum(FRANJAS_HORARIAS).optional(),
  descripcion: z.string(),
  ocurridoEn: z.string().datetime(),
  secuencia: z.number().int().positive().optional(),
  version: z.string().default('1.0.0')
});

export type EventoReprogramacion = z.infer<typeof EventoReprogramacionSchema>;

// Schema for alertas.sla
export const EventoAlertaSLASchema = z.object({
  eventId: z.string().uuid(),
  alertaId: z.string().min(1),
  shipmentId: z.string().min(1),
  regla: z.enum(REGLAS_SLA),
  prioridad: z.enum(PRIORIDADES_ALERTA),
  estado: z.enum(ESTADOS_ALERTA),
  causa: z.string(),
  ocurridoEn: z.string().datetime(),
  cerradaEn: z.string().datetime().optional(),
  version: z.string().default('1.0.0')
});

export type EventoAlertaSLA = z.infer<typeof EventoAlertaSLASchema>;

// Schema for notificaciones.enviadas
export const EventoNotificacionSchema = z.object({
  eventId: z.string().uuid(),
  notificacionId: z.string().min(1),
  shipmentId: z.string().min(1),
  tipo: z.string(),
  canal: z.enum(['EMAIL', 'SMS', 'WHATSAPP']),
  destinatario: z.string(),
  mensaje: z.string(),
  opcionesReprogramacion: z.array(z.string()).optional(),
  ocurridoEn: z.string().datetime(),
  version: z.string().default('1.0.0')
});

export type EventoNotificacion = z.infer<typeof EventoNotificacionSchema>;

// Schema for DLQ
export const EventoDLQSchema = z.object({
  eventId: z.string().optional(),
  shipmentId: z.string().optional(),
  topicOrigen: z.string(),
  payloadOriginal: z.any(),
  error: z.string(),
  consumidor: z.string(),
  recibidoEn: z.string().datetime()
});

export type EventoDLQ = z.infer<typeof EventoDLQSchema>;
