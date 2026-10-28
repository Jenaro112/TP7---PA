'use client';

import { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Clock,
  RotateCcw,
  Filter,
  CheckCircle2,
  RefreshCw,
  Play
} from 'lucide-react';

export default function AnaliticaPage() {
  const [metricas, setMetricas] = useState<any[]>([]);
  const [indicador4, setIndicador4] = useState<any[]>([]);
  const [zonaFilter, setZonaFilter] = useState('');
  const [hubFilter, setHubFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (zonaFilter) params.append('zonaId', zonaFilter);
      if (hubFilter) params.append('hubId', hubFilter);

      const [resMetricas, resInd4] = await Promise.all([
        fetch(`/api/analitica?path=metricas&${params.toString()}`),
        fetch(`/api/analitica?path=indicador-4`)
      ]);

      const dataMetricas = await resMetricas.json();
      const dataInd4 = await resInd4.json();

      if (dataMetricas.data) setMetricas(dataMetricas.data);
      if (dataInd4.data) setIndicador4(dataInd4.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [zonaFilter, hubFilter]);

  const handleRunReprocess = async () => {
    setReprocessing(true);
    try {
      const res = await fetch('/api/analitica', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'reprocess' })
      });
      const data = await res.json();
      setReprocessResult(data);
      // Actualizar datos
      await fetchData();
    } catch (e: any) {
      alert(`Error al reprocesar: ${e.message}`);
    } finally {
      setReprocessing(false);
    }
  };

  // Calcular agregados globales
  let totalEnvios = 0;
  let entregasPrimerIntento = 0;
  let entregasFallidas = 0;
  let entregadosTotal = 0;

  const motivos = {
    AUSENTE: 0,
    DIRECCION_INCORRECTA: 0,
    RECHAZADO: 0,
    ZONA_INACCESIBLE: 0
  };

  const slaByHub: Record<string, { cumplidos: number; fallidos: number }> = {};

  metricas.forEach(m => {
    totalEnvios += m.totalEnvios || 0;
    entregasPrimerIntento += m.entregasPrimerIntento || 0;
    entregasFallidas += m.entregasFallidas || 0;
    entregadosTotal += m.entregadosTotal || 0;

    if (m.motivosFallo) {
      motivos.AUSENTE += m.motivosFallo.AUSENTE || 0;
      motivos.DIRECCION_INCORRECTA += m.motivosFallo.DIRECCION_INCORRECTA || 0;
      motivos.RECHAZADO += m.motivosFallo.RECHAZADO || 0;
      motivos.ZONA_INACCESIBLE += m.motivosFallo.ZONA_INACCESIBLE || 0;
    }

    const hub = m.hubId || 'HUB-CENTRO';
    if (!slaByHub[hub]) slaByHub[hub] = { cumplidos: 0, fallidos: 0 };
    if (m.cumplimientoSla) {
      slaByHub[hub].cumplidos += m.cumplimientoSla.cumplidos || 0;
      slaByHub[hub].fallidos += m.cumplimientoSla.fallidos || 0;
    }
  });

  const totalPrimerIntentoEvaluados = entregasPrimerIntento + entregasFallidas;
  const tasaPrimerIntento = totalPrimerIntentoEvaluados > 0
    ? ((entregasPrimerIntento / totalPrimerIntentoEvaluados) * 100).toFixed(1)
    : '100.0';

  const totalFallos = Object.values(motivos).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            <span>Panel Analítico y Reprocesamiento</span>
          </h1>
          <p className="text-sm text-slate-400">
            Métricas de mejora continua precalculadas incrementalmente (CU4) y demostración de replay de log
          </p>
        </div>

        <button
          onClick={fetchData}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors self-start"
          title="Refrescar métricas"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap gap-4 items-center">
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Filter className="w-4 h-4" />
          <span>Filtros analíticos:</span>
        </div>

        <select
          value={zonaFilter}
          onChange={(e) => setZonaFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="">Todas las Zonas</option>
          <option value="ZONA-NORTE">ZONA-NORTE</option>
          <option value="ZONA-CENTRO">ZONA-CENTRO</option>
          <option value="ZONA-ESTE">ZONA-ESTE</option>
          <option value="ZONA-OESTE">ZONA-OESTE</option>
          <option value="ZONA-SUR">ZONA-SUR</option>
        </select>

        <select
          value={hubFilter}
          onChange={(e) => setHubFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
        >
          <option value="">Todos los Hubs</option>
          <option value="HUB-NORTE">HUB-NORTE</option>
          <option value="HUB-CENTRO">HUB-CENTRO</option>
          <option value="HUB-SUR">HUB-SUR</option>
        </select>
      </div>

      {/* Grid de Indicadores */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Indicador 1: Tasa de Entrega en Primer Intento */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Indicador 1 · Eficiencia
              </span>
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-white mt-1">Tasa de Entrega en 1º Intento</h3>
            <p className="text-xs text-slate-400 mt-1">¿Dónde y cuándo fallamos más?</p>
          </div>

          <div className="my-6">
            <div className="text-4xl font-extrabold text-emerald-400">{tasaPrimerIntento}%</div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-3">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${tasaPrimerIntento}%` }}
              />
            </div>
          </div>

          <div className="text-xs text-slate-400 border-t border-slate-800 pt-3 flex justify-between">
            <span>Éxitos en 1er intento: <strong className="text-white">{entregasPrimerIntento}</strong></span>
            <span>Total fallidos: <strong className="text-rose-400">{entregasFallidas}</strong></span>
          </div>
        </div>

        {/* Indicador 2: Distribución de Motivos de Fallo */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Indicador 2 · Diagnóstico
              </span>
              <PieChart className="w-5 h-5 text-amber-400" />
            </div>
            <h3 className="text-lg font-bold text-white mt-1">Motivos de Entrega Fallida</h3>
            <p className="text-xs text-slate-400 mt-1">¿Por qué fallamos en la entrega?</p>
          </div>

          <div className="space-y-2.5 my-4">
            {Object.entries(motivos).map(([motivo, count]) => {
              const pct = totalFallos > 0 ? Math.round((count / totalFallos) * 100) : 0;
              return (
                <div key={motivo}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">{motivo}</span>
                    <span className="text-slate-400">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 border-t border-slate-800 pt-3">
            <span>Total fallos acumulados: <strong className="text-white">{totalFallos}</strong></span>
          </div>
        </div>

        {/* Indicador 3: Cumplimiento de SLA */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Indicador 3 · Compromiso
              </span>
              <CheckCircle2 className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-white mt-1">Cumplimiento de SLA por Hub</h3>
            <p className="text-xs text-slate-400 mt-1">¿Qué hub llega a tiempo?</p>
          </div>

          <div className="space-y-3 my-4">
            {Object.keys(slaByHub).length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Sin entregas finalizadas aún.</p>
            ) : (
              Object.entries(slaByHub).map(([hub, s]) => {
                const total = s.cumplidos + s.fallidos;
                const pct = total > 0 ? Math.round((s.cumplidos / total) * 100) : 100;
                return (
                  <div key={hub}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-200 font-semibold">{hub}</span>
                      <span className="text-blue-400 font-bold">{pct}% a tiempo</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="text-xs text-slate-400 border-t border-slate-800 pt-3">
            <span>Calculado sobre entregas registradas</span>
          </div>
        </div>
      </div>

      {/* Indicador 4: Demostración de Reprocesamiento Histórico */}
      <div className="bg-slate-900 border-2 border-indigo-500/30 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                CU4 · EVENT REPLAY & REPROCESAMIENTO
              </span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              Indicador 4: Tiempo Medio entre Hub y Reparto por Centro
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Este indicador demuestra el poder del log inmutable de Kafka: un grupo de consumidores totalmente nuevo
              lee el histórico completo desde el offset cero y calcula la métrica sin reiniciar ni afectar a los demás servicios.
            </p>
          </div>

          <button
            onClick={handleRunReprocess}
            disabled={reprocessing}
            className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-indigo-600/30 whitespace-nowrap self-start md:self-auto"
          >
            {reprocessing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Rebobinando y Procesando Kafka...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Ejecutar Reprocesamiento Histórico</span>
              </>
            )}
          </button>
        </div>

        {/* Resultados del Indicador 4 */}
        <div className="mt-6">
          {indicador4.length === 0 ? (
            <div className="text-center py-8 text-slate-400 border border-dashed border-slate-800 rounded-xl">
              <Clock className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-75" />
              <p className="text-sm font-medium">Indicador no calculado aún</p>
              <p className="text-xs text-slate-500 mt-1">
                Hacé click en "Ejecutar Reprocesamiento Histórico" para levantar un nuevo grupo de consumidores que lea desde el inicio de <code>envios.estados</code>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {indicador4.map((stat) => (
                <div
                  key={stat.hubId}
                  className="bg-slate-950 border border-indigo-900/40 p-4 rounded-xl flex flex-col justify-between"
                >
                  <div>
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                      {stat.hubId}
                    </span>
                    <div className="text-3xl font-extrabold text-white mt-2">
                      {stat.tiempoMedioMinutos} <span className="text-base font-normal text-slate-400">min</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Tiempo promedio en depósito</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-900 text-[11px] text-slate-500">
                    Calculado sobre {stat.totalEnvios} envíos históricos
                  </div>
                </div>
              ))}
            </div>
          )}

          {reprocessResult && (
            <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-xs text-emerald-300">
              ✓ Reprocesamiento completado con éxito por grupo <strong>{reprocessResult.groupId}</strong>. Total eventos leídos: <strong>{reprocessResult.totalEventosProcesados}</strong>.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
