'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Flame,
  Bug,
  Pause,
  Play,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
  Server,
  RefreshCw
} from 'lucide-react';

export default function DemoPanelPage() {
  const [config, setConfig] = useState<any>({
    continuous: false,
    enviosPorMinuto: 20,
    factorAceleracion: 120,
    simulatedTime: ''
  });

  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastScenarioResult, setLastScenarioResult] = useState<any>(null);
  const [dlqItems, setDlqItems] = useState<any[]>([]);
  const [dlqLoading, setDlqLoading] = useState(false);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/simulador');
      const data = await res.json();
      if (data) setConfig(data);
    } catch {}
  };

  const fetchDLQ = async () => {
    setDlqLoading(true);
    try {
      const res = await fetch('/api/dlq');
      const data = await res.json();
      if (data.items) setDlqItems(data.items);
    } catch {}
    finally {
      setDlqLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    fetchDLQ();
    const timer = setInterval(fetchConfig, 5000);
    return () => clearInterval(timer);
  }, []);

  const triggerScenario = async (scenario: string, payload?: any) => {
    setLoadingAction(scenario);
    try {
      const res = await fetch('/api/simulador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: `scenarios/${scenario}`,
          payload: payload || {}
        })
      });
      const data = await res.json();
      setLastScenarioResult({ scenario, data });

      if (scenario === 'malformado') {
        setTimeout(fetchDLQ, 1500);
      }
    } catch (err: any) {
      alert(`Error al ejecutar escenario: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleContinuous = async () => {
    setLoadingAction('toggle-continuous');
    try {
      const nextState = !config.continuous;
      const res = await fetch('/api/simulador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'config',
          payload: { continuous: nextState }
        })
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const updateRate = async (rate: number) => {
    try {
      await fetch('/api/simulador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'config',
          payload: { enviosPorMinuto: rate }
        })
      });
      setConfig((prev: any) => ({ ...prev, enviosPorMinuto: rate }));
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
            <PlayCircle className="w-6 h-6 text-emerald-400" />
            <span>Panel de Control para la Demo</span>
          </h1>
          <p className="text-sm text-slate-400">
            Disparadores interactivos de los escenarios de prueba y verificación de la arquitectura dirigida por eventos
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right text-xs bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="text-slate-400 block">Reloj Simulado (Acelerado 120x)</span>
            <span className="font-mono text-emerald-300 font-semibold">
              {config.simulatedTime ? new Date(config.simulatedTime).toLocaleTimeString() : 'En marcha'}
            </span>
          </div>
        </div>
      </div>

      {/* Flujo Continuo Controls */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className={`w-3 h-3 rounded-full ${config.continuous ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <h3 className="text-lg font-bold text-white">Flujo Continuo de Operación</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Genera eventos automáticos reproduciendo la operación normal con duplicados (2%), eventos fuera de orden (2%) y demoras (10%).
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <span>Velocidad:</span>
              <select
                value={config.enviosPorMinuto || 20}
                onChange={(e) => updateRate(parseInt(e.target.value, 10))}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
              >
                <option value={5}>5 envíos / min</option>
                <option value={20}>20 envíos / min (Sugerido)</option>
                <option value={60}>60 envíos / min</option>
                <option value={120}>120 envíos / min</option>
              </select>
            </div>

            <button
              onClick={toggleContinuous}
              disabled={loadingAction === 'toggle-continuous'}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md ${
                config.continuous
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {config.continuous ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Pausar Flujo Continuo</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Iniciar Flujo Continuo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Escenarios Guiados */}
      <div>
        <h2 className="text-lg font-bold text-white mb-3">Escenarios del Guion de la Demo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Escenario 1: Envío Feliz */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                  Paso 2 · Caso de Uso 1
                </span>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <h4 className="text-base font-bold text-white">1. Envío Feliz</h4>
              <p className="text-xs text-slate-400 mt-1">
                Recorre el ciclo de vida completo: Creado, Ingreso Hub, Clasificado, En Reparto y Entregado sin incidentes.
              </p>
            </div>

            <button
              onClick={() => triggerScenario('feliz')}
              disabled={loadingAction === 'feliz'}
              className="mt-4 w-full py-2 bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 text-emerald-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loadingAction === 'feliz' ? 'Disparando...' : 'Disparar Envío Feliz'}</span>
            </button>
          </div>

          {/* Escenario 2: Ausente */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded">
                  Paso 3 · Caso de Uso 2
                </span>
                <RotateCcw className="w-5 h-5 text-purple-400" />
              </div>
              <h4 className="text-base font-bold text-white">2. Ausente (Reprogramación)</h4>
              <p className="text-xs text-slate-400 mt-1">
                Falla por destinatario AUSENTE. Desencadena en paralelo las 3 reacciones independientes: notificación, reprogramación en franja opuesta y analítica.
              </p>
            </div>

            <button
              onClick={() => triggerScenario('ausente')}
              disabled={loadingAction === 'ausente'}
              className="mt-4 w-full py-2 bg-purple-600/20 hover:bg-purple-600 border border-purple-500/40 text-purple-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loadingAction === 'ausente' ? 'Disparando...' : 'Disparar Fallo Ausente'}</span>
            </button>
          </div>

          {/* Escenario 3: Demorado */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                  Paso 4 · Caso de Uso 3
                </span>
                <ShieldAlert className="w-5 h-5 text-amber-400" />
              </div>
              <h4 className="text-base font-bold text-white">3. Demorado (Alerta SLA)</h4>
              <p className="text-xs text-slate-400 mt-1">
                Queda retenido en el hub con una promesa de entrega cercana. El monitor detecta la ausencia de EN_REPARTO y emite alerta de SLA.
              </p>
            </div>

            <button
              onClick={() => triggerScenario('demorado', { hoursToExpiry: 2 })}
              disabled={loadingAction === 'demorado'}
              className="mt-4 w-full py-2 bg-amber-600/20 hover:bg-amber-600 border border-amber-500/40 text-amber-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loadingAction === 'demorado' ? 'Disparando...' : 'Disparar Demora en Hub'}</span>
            </button>
          </div>

          {/* Escenario 4: Tercer Fallo */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded">
                  Criterio CU2
                </span>
                <Flame className="w-5 h-5 text-rose-400" />
              </div>
              <h4 className="text-base font-bold text-white">4. Tercer Fallo (Devolución)</h4>
              <p className="text-xs text-slate-400 mt-1">
                El envío acumula 3 intentos fallidos consecutivos. La regla de reprogramación lo excluye del circuito y lo marca para devolución al comercio.
              </p>
            </div>

            <button
              onClick={() => triggerScenario('tercer-fallo')}
              disabled={loadingAction === 'tercer-fallo'}
              className="mt-4 w-full py-2 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loadingAction === 'tercer-fallo' ? 'Disparando...' : 'Disparar 3er Fallo'}</span>
            </button>
          </div>

          {/* Escenario 5: Evento Malformado (DLQ) */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 rounded">
                  Paso 6 · Manejo de Errores
                </span>
                <Bug className="w-5 h-5 text-yellow-400" />
              </div>
              <h4 className="text-base font-bold text-white">5. Inyectar Malformado (DLQ)</h4>
              <p className="text-xs text-slate-400 mt-1">
                Publica un mensaje con esquema corrupto. El proyector valida el esquema, lo desvía a <code>envios.estados.dlq</code> y continúa sin caerse.
              </p>
            </div>

            <button
              onClick={() => triggerScenario('malformado')}
              disabled={loadingAction === 'malformado'}
              className="mt-4 w-full py-2 bg-yellow-600/20 hover:bg-yellow-600 border border-yellow-500/40 text-yellow-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loadingAction === 'malformado' ? 'Disparando...' : 'Inyectar a DLQ'}</span>
            </button>
          </div>

          {/* Escenario 6: Ráfaga */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition-all">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
                  Stress & Concurrencia
                </span>
                <Flame className="w-5 h-5 text-sky-400" />
              </div>
              <h4 className="text-base font-bold text-white">6. Ráfaga de 500 Envíos</h4>
              <p className="text-xs text-slate-400 mt-1">
                Genera 500 envíos en pocos segundos distribuidos en las 3 particiones para observar acumulación en buffers y rápida absorción.
              </p>
            </div>

            <button
              onClick={() => triggerScenario('rafaga', { count: 500 })}
              disabled={loadingAction === 'rafaga'}
              className="mt-4 w-full py-2 bg-sky-600/20 hover:bg-sky-600 border border-sky-500/40 text-sky-200 hover:text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{loadingAction === 'rafaga' ? 'Disparando ráfaga...' : 'Disparar 500 Envíos'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback del último escenario ejecutado */}
      {lastScenarioResult && (
        <div className="p-4 bg-slate-900 border border-blue-500/40 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-200">
              Escenario <strong>{lastScenarioResult.scenario}</strong> ejecutado con éxito.
              {lastScenarioResult.data?.shipmentId && (
                <span> ID de Envío: <code className="text-blue-300 font-bold">{lastScenarioResult.data.shipmentId}</code></span>
              )}
            </span>
          </div>

          {lastScenarioResult.data?.shipmentId && (
            <div className="flex items-center space-x-3">
              <Link
                href={`/envios/${lastScenarioResult.data.shipmentId}`}
                className="text-blue-400 hover:text-blue-300 underline font-semibold flex items-center space-x-1"
              >
                <span>Ver en Detalle</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
              <Link
                href={`/tracking/${lastScenarioResult.data.shipmentId}`}
                className="text-emerald-400 hover:text-emerald-300 underline font-semibold flex items-center space-x-1"
              >
                <span>Ver en Tracking</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Inspector de DLQ (Dead Letter Queue) */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Bug className="w-5 h-5 text-yellow-400" />
            <h3 className="text-base font-bold text-white">Mensajes en Dead Letter Queue (envios.estados.dlq)</h3>
          </div>
          <button
            onClick={fetchDLQ}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-xs flex items-center space-x-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Actualizar DLQ</span>
          </button>
        </div>

        {dlqItems.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 italic">
            La DLQ está vacía. Inyectá un evento malformado desde el botón de arriba para probar la captura.
          </p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {dlqItems.map((item, idx) => (
              <div key={idx} className="bg-slate-950 border border-yellow-900/40 p-3 rounded-lg text-xs">
                <div className="flex items-center justify-between text-yellow-400 font-medium">
                  <span>Envío: {item.shipmentId || 'Desconocido'}</span>
                  <span className="text-[11px] text-slate-500">{new Date(item.recibidoEn).toLocaleTimeString()}</span>
                </div>
                <p className="text-rose-300 mt-1 font-mono text-[11px]">{item.error}</p>
                <div className="text-slate-500 text-[10px] mt-1">Consumidor: {item.consumidor} · Topic: {item.topicOrigen}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
