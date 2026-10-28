'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Truck,
  Package,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
  RotateCcw,
  RefreshCw
} from 'lucide-react';

export default function TrackingPublicoPage() {
  const params = useParams();
  const id = params?.id as string;

  const [envio, setEnvio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTracking = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/envios/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'No se encontró el envío con ese identificador.');
      } else {
        setEnvio(data.envio);
        setError(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTracking();

    // Actualizaciones en vivo por SSE
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events/sse');
      eventSource.addEventListener('envio-change', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.doc?.shipmentId === id) {
            setEnvio(payload.doc);
          }
        } catch {}
      });
    } catch {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [fetchTracking, id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-500" />
        <p>Buscando información de tu paquete...</p>
      </div>
    );
  }

  if (error || !envio) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-xl">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Paquete no encontrado</h2>
          <p className="text-sm text-slate-400 mb-6">{error || 'Verificá que el código ingresado sea el correcto.'}</p>
          <Link
            href="/tracking"
            className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            Buscar otro envío
          </Link>
        </div>
      </div>
    );
  }

  // Mapear estado técnico a estado amigable para el destinatario
  let friendlyTitle = 'Procesando tu envío';
  let friendlyDescription = 'El paquete está siendo procesado en nuestra red logística.';
  let step = 1; // 1: Creado, 2: En centro, 3: En reparto, 4: Entregado

  switch (envio.estado) {
    case 'CREADO':
      friendlyTitle = 'Pedido registrado';
      friendlyDescription = 'El comercio registró el paquete. Pronto ingresará a nuestro centro de distribución.';
      step = 1;
      break;
    case 'INGRESADO_HUB':
    case 'CLASIFICADO':
      friendlyTitle = 'En centro de distribución';
      friendlyDescription = 'Tu paquete está siendo preparado y clasificado para la ruta de entrega.';
      step = 2;
      break;
    case 'EN_REPARTO':
      friendlyTitle = 'En camino a tu domicilio';
      friendlyDescription = 'El repartidor está en recorrido hacia tu dirección de entrega.';
      step = 3;
      break;
    case 'ENTREGADO':
      friendlyTitle = '¡Paquete entregado!';
      friendlyDescription = 'La entrega se concretó exitosamente. ¡Gracias por confiar en RutaSur!';
      step = 4;
      break;
    case 'ENTREGA_FALLIDA':
    case 'RETENIDO':
      friendlyTitle = 'Visita sin éxito';
      friendlyDescription = envio.reprogramacion?.descripcion || 'Visitamos tu domicilio pero no fue posible completar la entrega. Estamos coordinando la reprogramación.';
      step = 3;
      break;
    case 'DEVUELTO_AL_COMERCIO':
      friendlyTitle = 'En devolución al comercio';
      friendlyDescription = 'El paquete se encuentra en retorno al remitente por imposibilidad de entrega o rechazo.';
      step = 3;
      break;
  }

  const steps = [
    { num: 1, label: 'Registrado' },
    { num: 2, label: 'En Distribución' },
    { num: 3, label: 'En Reparto' },
    { num: 4, label: 'Entregado' }
  ];

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <Link
        href="/tracking"
        className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Rastrear otro paquete</span>
      </Link>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-2">
          <div>
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Guía de Envío</span>
            <div className="text-xl sm:text-2xl font-bold font-mono text-white mt-0.5">{envio.shipmentId}</div>
          </div>
          <div className="text-right sm:text-right">
            <span className="text-xs text-slate-400">Fecha estimada de entrega</span>
            <div className="text-sm font-semibold text-blue-400">
              {envio.promesa?.venceEn
                ? new Date(envio.promesa.venceEn).toLocaleDateString()
                : 'En las próximas 24 horas'}
            </div>
          </div>
        </div>

        {/* Status Hero */}
        <div className="py-6 text-center">
          <div className="inline-flex p-3 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 mb-3">
            {envio.estado === 'ENTREGADO' ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            ) : envio.estado === 'ENTREGA_FALLIDA' ? (
              <RotateCcw className="w-8 h-8 text-rose-400" />
            ) : (
              <Truck className="w-8 h-8 text-blue-400" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-white">{friendlyTitle}</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-2">{friendlyDescription}</p>
        </div>

        {/* Progress Bar */}
        <div className="py-4">
          <div className="relative">
            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-slate-800">
              <div
                style={{ width: `${(step / 4) * 100}%` }}
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-500"
              />
            </div>
            <div className="flex justify-between text-xs font-medium text-slate-400">
              {steps.map(s => (
                <div
                  key={s.num}
                  className={`flex flex-col items-center ${s.num <= step ? 'text-blue-400 font-bold' : 'text-slate-600'}`}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mb-1 border ${s.num <= step ? 'border-blue-500 bg-blue-950 text-blue-300' : 'border-slate-800 bg-slate-900 text-slate-600'}`}>
                    {s.num}
                  </span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reprogramación info si hubo fallo */}
        {envio.reprogramacion && envio.reprogramacion.accion === 'NUEVO_INTENTO' && (
          <div className="mt-6 p-4 rounded-xl bg-slate-950 border border-blue-900/50 text-sm">
            <h4 className="font-semibold text-blue-300 flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>Próximo Intento de Entrega Programado</span>
            </h4>
            <p className="text-xs text-slate-300 mt-1">
              Reprogramado en franja horaria <strong className="text-white">{envio.reprogramacion.franjaHoraria}</strong> para el siguiente día hábil. No tenés que hacer ningún trámite adicional.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
