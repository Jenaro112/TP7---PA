'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Calendar,
  Clock,
  MapPin,
  User,
  AlertTriangle,
  MessageSquare,
  RotateCcw,
  CheckCircle2,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export default function DetalleEnvioPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnvio = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/envios/${encodeURIComponent(id)}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Envío no encontrado');
      } else {
        setData(json);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEnvio();

    // SSE para actualizaciones en vivo
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events/sse');
      eventSource.addEventListener('envio-change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.doc?.shipmentId === id) {
            fetchEnvio();
          }
        } catch {}
      });
      eventSource.addEventListener('alerta-change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.doc?.shipmentId === id) {
            fetchEnvio();
          }
        } catch {}
      });
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [fetchEnvio, id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
        <p>Cargando detalle del envío...</p>
      </div>
    );
  }

  if (error || !data?.envio) {
    return (
      <div className="py-16 text-center">
        <div className="bg-slate-900 border border-slate-800 max-w-md mx-auto p-8 rounded-xl shadow-lg">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Envío no encontrado</h2>
          <p className="text-sm text-slate-400 mb-6">{error || 'No se encontró el paquete solicitado.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Volver a Torre de Control
          </button>
        </div>
      </div>
    );
  }

  const { envio, alertas = [], notificaciones = [] } = data;
  const historial = envio.historial || [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center space-x-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a Torre de Control</span>
        </Link>

        <div className="flex items-center space-x-3">
          <Link
            href={`/tracking/${envio.shipmentId}`}
            target="_blank"
            className="flex items-center space-x-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            <span>Ver como destinatario (Tracking Público)</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <button
            onClick={fetchEnvio}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
            title="Refrescar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-2xl font-bold font-mono text-white">{envio.shipmentId}</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-blue-500/20 text-blue-300 border-blue-500/40">
                {envio.estado}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Última secuencia aplicada: <span className="font-semibold text-slate-300">#{envio.ultimaSecuencia}</span> · Intentos de entrega: <span className="font-semibold text-slate-300">{envio.intentos || 0}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Hub Logístico</span>
              <span className="font-semibold text-slate-200">{envio.hubId || 'No asignado'}</span>
            </div>
            <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Zona de Reparto</span>
              <span className="font-semibold text-slate-200">{envio.zonaId || 'No asignada'}</span>
            </div>
            <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 block">Repartidor</span>
              <span className="font-semibold text-slate-200">{envio.repartidorId || 'Sin asignar'}</span>
            </div>
          </div>
        </div>

        {/* Reprogramación Banner si existe */}
        {envio.reprogramacion && (
          <div className="mt-5 p-4 rounded-xl bg-purple-950/40 border border-purple-800/60 flex items-start space-x-3">
            <RotateCcw className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <div className="font-semibold text-purple-200">
                Gestión de Reprogramación: {envio.reprogramacion.accion}
              </div>
              <p className="text-purple-300/90 text-xs mt-0.5">{envio.reprogramacion.descripcion}</p>
              {envio.reprogramacion.franjaHoraria && (
                <div className="mt-2 text-xs text-purple-300 flex items-center space-x-3">
                  <span>Próxima Franja: <strong className="text-white">{envio.reprogramacion.franjaHoraria}</strong></span>
                  {envio.reprogramacion.nuevaFechaEstimada && (
                    <span>Fecha Estimada: <strong className="text-white">{new Date(envio.reprogramacion.nuevaFechaEstimada).toLocaleDateString()}</strong></span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid: Historial (Timeline) & Paneles Laterales */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Timeline (8 cols) */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <span>Línea de Tiempo del Ciclo de Vida</span>
          </h2>

          <div className="relative pl-6 border-l-2 border-slate-800 space-y-6 my-4">
            {historial.map((ev: any, idx: number) => {
              const isLast = idx === historial.length - 1;
              return (
                <div key={ev.eventId || idx} className="relative group">
                  {/* Timeline dot */}
                  <div
                    className={`absolute -left-[31px] top-1 w-4 h-4 rounded-full border-2 border-slate-900 ${
                      isLast ? 'bg-blue-500 ring-4 ring-blue-500/20' : 'bg-slate-700'
                    }`}
                  />

                  <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl hover:border-slate-700 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-100 flex items-center space-x-2">
                        <span>{ev.tipo}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                          Seq #{ev.secuencia}
                        </span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(ev.ocurridoEn).toLocaleTimeString()} · {new Date(ev.ocurridoEn).toLocaleDateString()}
                      </span>
                    </div>

                    {ev.motivo && (
                      <p className="text-xs text-rose-400 mt-1 font-medium">
                        Motivo de fallo: {ev.motivo}
                      </p>
                    )}

                    <div className="flex items-center space-x-4 text-xs text-slate-400 mt-2">
                      {ev.hubId && <span>Hub: {ev.hubId}</span>}
                      {ev.zonaId && <span>Zona: {ev.zonaId}</span>}
                      {ev.repartidorId && <span>Repartidor: {ev.repartidorId}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Paneles Laterales: Alertas SLA y Notificaciones (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Alertas SLA de este paquete */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
            <h3 className="text-base font-bold text-white mb-3 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Alertas de SLA ({alertas.length})</span>
            </h3>

            {alertas.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">Sin alertas de SLA registradas para este envío.</p>
            ) : (
              <div className="space-y-2.5">
                {alertas.map((al: any) => (
                  <div key={al.alertaId} className="bg-slate-950 border border-slate-800/80 p-3 rounded-lg text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-amber-400">{al.regla}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${al.estado === 'ABIERTA' ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                        {al.estado}
                      </span>
                    </div>
                    <p className="text-slate-300">{al.causa}</p>
                    <span className="text-slate-500 block mt-1.5 text-[11px]">{new Date(al.creadaEn).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notificaciones enviadas al cliente */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
            <h3 className="text-base font-bold text-white mb-3 flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Notificaciones Emitidas ({notificaciones.length})</span>
            </h3>

            {notificaciones.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">Aún no se han enviado notificaciones.</p>
            ) : (
              <div className="space-y-2.5">
                {notificaciones.map((notif: any) => (
                  <div key={notif.notificacionId} className="bg-slate-950 border border-slate-800/80 p-3 rounded-lg text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-emerald-400">{notif.canal}</span>
                      <span className="text-slate-500 text-[10px]">{notif.destinatario}</span>
                    </div>
                    <p className="text-slate-300 italic">"{notif.mensaje}"</p>
                    {notif.opcionesReprogramacion && (
                      <div className="flex gap-1 mt-1.5">
                        {notif.opcionesReprogramacion.map((opt: string) => (
                          <span key={opt} className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
