'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  RotateCcw,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  Search
} from 'lucide-react';

interface Counters {
  TOTAL: number;
  CREADO: number;
  INGRESADO_HUB: number;
  CLASIFICADO: number;
  EN_REPARTO: number;
  ENTREGADO: number;
  ENTREGA_FALLIDA: number;
  RETENIDO: number;
  DEVUELTO_AL_COMERCIO: number;
}

interface Alerta {
  alertaId: string;
  shipmentId: string;
  regla: string;
  prioridad: 'CRITICA' | 'ALTA' | 'MEDIA';
  estado: 'ABIERTA' | 'CERRADA';
  causa: string;
  ocurridoEn: string;
  creadaEn: string;
}

interface Envio {
  shipmentId: string;
  estado: string;
  hubId?: string;
  zonaId?: string;
  repartidorId?: string;
  intentos: number;
  updatedAt: string;
  promesa?: {
    venceEn: string;
  };
}

export default function TorreDeControlPage() {
  const [counters, setCounters] = useState<Counters>({
    TOTAL: 0,
    CREADO: 0,
    INGRESADO_HUB: 0,
    CLASIFICADO: 0,
    EN_REPARTO: 0,
    ENTREGADO: 0,
    ENTREGA_FALLIDA: 0,
    RETENIDO: 0,
    DEVUELTO_AL_COMERCIO: 0
  });

  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [recentEnvios, setRecentEnvios] = useState<Envio[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertaFilter, setAlertaFilter] = useState<'TODAS' | 'CRITICA' | 'ALTA' | 'MEDIA'>('TODAS');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [enviosRes, alertasRes] = await Promise.all([
        fetch('/api/envios?limit=15'),
        fetch('/api/alertas?limit=25')
      ]);

      if (enviosRes.ok) {
        const enviosData = await enviosRes.json();
        if (enviosData.counters) setCounters(enviosData.counters);
        if (enviosData.envios) setRecentEnvios(enviosData.envios);
      }

      if (alertasRes.ok) {
        const alertasData = await alertasRes.json();
        if (alertasData.alertas) setAlertas(alertasData.alertas);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Conectar a Server-Sent Events (SSE) para actualizaciones en vivo (< 2 seg)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events/sse');

      eventSource.addEventListener('envio-change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          const doc: Envio = payload.doc;
          if (doc) {
            setRecentEnvios(prev => {
              const filtered = prev.filter(item => item.shipmentId !== doc.shipmentId);
              return [doc, ...filtered].slice(0, 15);
            });
            // Recargar contadores
            fetch('/api/envios?limit=1')
              .then(res => res.json())
              .then(data => {
                if (data.counters) setCounters(data.counters);
              })
              .catch(() => {});
          }
        } catch {
          // ignore parse error
        }
      });

      eventSource.addEventListener('alerta-change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          const doc: Alerta = payload.doc;
          if (doc) {
            setAlertas(prev => {
              const filtered = prev.filter(a => a.alertaId !== doc.alertaId);
              return [doc, ...filtered];
            });
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // Fallback a polling si SSE falla
      const pollTimer = setInterval(fetchData, 4000);
      return () => clearInterval(pollTimer);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [fetchData]);

  const filteredAlertas = alertas.filter(a => {
    if (a.estado !== 'ABIERTA') return false;
    if (alertaFilter === 'TODAS') return true;
    return a.prioridad === alertaFilter;
  });

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'CRITICA':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'ALTA':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'ENTREGADO':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'ENTREGA_FALLIDA':
      case 'DEVUELTO_AL_COMERCIO':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'RETENIDO':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'EN_REPARTO':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
            <span>Torre de Control</span>
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </h1>
          <p className="text-sm text-slate-400">
            Monitoreo en tiempo real de operaciones de última milla y cola de alertas SLA
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchQuery.trim()) {
                window.location.href = `/envios/${encodeURIComponent(searchQuery.trim())}`;
              }
            }}
            className="relative"
          >
            <input
              type="text"
              placeholder="Buscar envío (ej. RS-FELIZ...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-sm rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 text-slate-200"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
          </form>

          <button
            onClick={fetchData}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors"
            title="Refrescar datos"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contadores por Estado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Total</span>
            <Package className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-1">{counters.TOTAL}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Creados</span>
            <Clock className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-sky-300 mt-1">{counters.CREADO}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>En Hub</span>
            <Package className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300 mt-1">{counters.INGRESADO_HUB}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Clasificados</span>
            <RefreshCw className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <div className="text-2xl font-bold text-yellow-300 mt-1">{counters.CLASIFICADO}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>En Reparto</span>
            <Truck className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-400 mt-1">{counters.EN_REPARTO}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Entregados</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{counters.ENTREGADO}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Fallidos</span>
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{counters.ENTREGA_FALLIDA}</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl shadow-sm">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Retenidos</span>
            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400 mt-1">{counters.RETENIDO + counters.DEVUELTO_AL_COMERCIO}</div>
        </div>
      </div>

      {/* Main Grid: Alertas Priorizadas & Ultimos Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Cola de Alertas Priorizada (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-white">Cola de Alertas de SLA</h2>
              <span className="text-xs bg-slate-800 text-amber-300 px-2 py-0.5 rounded-full border border-slate-700">
                {filteredAlertas.length} activas
              </span>
            </div>

            {/* Filtro de prioridad */}
            <div className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              {(['TODAS', 'CRITICA', 'ALTA', 'MEDIA'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setAlertaFilter(p)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    alertaFilter === p
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-[480px] pr-1">
            {filteredAlertas.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border border-dashed border-slate-800 rounded-xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-medium">No hay alertas de SLA activas</p>
                <p className="text-xs text-slate-500 mt-1">Todos los envíos cumplen sus plazos de entrega.</p>
              </div>
            ) : (
              filteredAlertas.map(alerta => (
                <div
                  key={alerta.alertaId}
                  className="bg-slate-950 border border-slate-800/90 hover:border-slate-700 p-3.5 rounded-xl transition-all shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getPriorityBadge(alerta.prioridad)}`}>
                        {alerta.prioridad}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {alerta.regla}
                      </span>
                    </div>

                    <Link
                      href={`/envios/${alerta.shipmentId}`}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-0.5"
                    >
                      <span>Ver envío</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <p className="text-sm text-slate-200 mt-2 font-medium">
                    {alerta.causa}
                  </p>

                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2.5 pt-2 border-t border-slate-900">
                    <span className="font-mono text-slate-400">{alerta.shipmentId}</span>
                    <span>{new Date(alerta.creadaEn).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Columna Derecha: Últimos Envíos en Vivo (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Truck className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold text-white">Últimos Eventos</h2>
            </div>
            <Link
              href="/envios"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
            >
              <span>Ver todos</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-[480px] pr-1">
            {recentEnvios.length === 0 ? (
              <div className="text-center py-12 text-slate-400 border border-dashed border-slate-800 rounded-xl">
                <p className="text-sm">Aguardando eventos del simulador...</p>
              </div>
            ) : (
              recentEnvios.map(envio => (
                <Link
                  key={envio.shipmentId}
                  href={`/envios/${envio.shipmentId}`}
                  className="block bg-slate-950 border border-slate-800/80 hover:border-blue-500/50 p-3 rounded-lg transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-xs font-semibold text-slate-200 group-hover:text-blue-400 transition-colors">
                      {envio.shipmentId}
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getStatusBadge(envio.estado)}`}>
                      {envio.estado}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                    <span>{envio.zonaId || 'ZONA-GENERAL'} · {envio.hubId || 'HUB-CENTRAL'}</span>
                    <span className="text-slate-500 text-[11px]">{new Date(envio.updatedAt).toLocaleTimeString()}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
