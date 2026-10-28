'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Truck, Search, ShieldCheck, Clock, MapPin } from 'lucide-react';

export default function TrackingSearchPage() {
  const [trackingNumber, setTrackingNumber] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (trackingNumber.trim()) {
      router.push(`/tracking/${encodeURIComponent(trackingNumber.trim())}`);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="text-center mb-10">
        <div className="inline-flex p-3 bg-blue-600/20 text-blue-400 rounded-2xl mb-4 border border-blue-500/30">
          <Truck className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Seguimiento de Envíos en Tiempo Real
        </h1>
        <p className="text-slate-400 mt-2 text-sm">
          Ingresá tu código de seguimiento provisto por el comercio para conocer el estado y la fecha estimada de entrega de tu paquete.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <form onSubmit={handleSearch} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Número de Guía o Envío
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ej. RS-FELIZ-1234, RS-AUS-..."
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-11 pr-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2"
          >
            <span>Rastrear mi paquete</span>
            <Truck className="w-5 h-5" />
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 text-center text-xs text-slate-400">
        <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl">
          <Clock className="w-5 h-5 text-blue-400 mx-auto mb-2" />
          <h4 className="font-semibold text-slate-200">En Tiempo Real</h4>
          <p className="mt-1 text-slate-400">Actualizado instantáneamente con cada evento operativo.</p>
        </div>
        <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl">
          <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
          <h4 className="font-semibold text-slate-200">Entrega Segura</h4>
          <p className="mt-1 text-slate-400">Reprogramación automática y notificaciones ante cualquier imprevisto.</p>
        </div>
        <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-xl">
          <MapPin className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
          <h4 className="font-semibold text-slate-200">Red Nacional</h4>
          <p className="mt-1 text-slate-400">Distribución ágil y coordinada en todos nuestros centros de distribución.</p>
        </div>
      </div>
    </div>
  );
}
