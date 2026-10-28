'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Package, Search, Filter, ArrowUpRight, RefreshCw } from 'lucide-react';

export default function EnvíosListPage() {
  const [envios, setEnvios] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [zonaFilter, setZonaFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchEnvios = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (estadoFilter) params.append('estado', estadoFilter);
      if (zonaFilter) params.append('zonaId', zonaFilter);
      params.append('limit', '100');

      const res = await fetch(`/api/envios?${params.toString()}`);
      const data = await res.json();
      if (data.envios) setEnvios(data.envios);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnvios();
  }, [estadoFilter, zonaFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEnvios();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center space-x-2">
            <Package className="w-6 h-6 text-blue-500" />
            <span>Explorador de Envíos</span>
          </h1>
          <p className="text-sm text-slate-400">
            Consulta y seguimiento del modelo de lectura proyectado en MongoDB
          </p>
        </div>

        <button
          onClick={fetchEnvios}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors self-start"
          title="Refrescar lista"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-wrap gap-3 items-center">
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Filtrar por código de seguimiento..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
        </form>

        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none"
        >
          <option value="">Todos los Estados</option>
          <option value="CREADO">CREADO</option>
          <option value="INGRESADO_HUB">INGRESADO_HUB</option>
          <option value="CLASIFICADO">CLASIFICADO</option>
          <option value="EN_REPARTO">EN_REPARTO</option>
          <option value="ENTREGADO">ENTREGADO</option>
          <option value="ENTREGA_FALLIDA">ENTREGA_FALLIDA</option>
          <option value="RETENIDO">RETENIDO</option>
          <option value="DEVUELTO_AL_COMERCIO">DEVUELTO_AL_COMERCIO</option>
        </select>

        <select
          value={zonaFilter}
          onChange={(e) => setZonaFilter(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none"
        >
          <option value="">Todas las Zonas</option>
          <option value="ZONA-NORTE">ZONA-NORTE</option>
          <option value="ZONA-CENTRO">ZONA-CENTRO</option>
          <option value="ZONA-ESTE">ZONA-ESTE</option>
          <option value="ZONA-OESTE">ZONA-OESTE</option>
          <option value="ZONA-SUR">ZONA-SUR</option>
        </select>
      </div>

      {/* Tabla de Resultados */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3 font-semibold">Envío ID</th>
                <th className="px-5 py-3 font-semibold">Estado</th>
                <th className="px-5 py-3 font-semibold">Hub / Zona</th>
                <th className="px-5 py-3 font-semibold">Repartidor</th>
                <th className="px-5 py-3 font-semibold">Intentos</th>
                <th className="px-5 py-3 font-semibold">Última Actualización</th>
                <th className="px-5 py-3 font-semibold text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    Cargando envíos...
                  </td>
                </tr>
              ) : envios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500">
                    No se encontraron envíos con los criterios especificados.
                  </td>
                </tr>
              ) : (
                envios.map((env) => (
                  <tr key={env.shipmentId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-medium text-white">
                      {env.shipmentId}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 border border-slate-700">
                        {env.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {env.hubId || '-'} / {env.zonaId || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-xs font-mono text-slate-400">
                      {env.repartidorId || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {env.intentos > 0 ? (
                        <span className="text-rose-400 font-semibold">{env.intentos}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      {new Date(env.updatedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/envios/${env.shipmentId}`}
                        className="inline-flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded transition-colors"
                      >
                        <span>Detalle</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
