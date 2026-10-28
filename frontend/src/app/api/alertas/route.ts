import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { collections } = await getDb();
    const { searchParams } = new URL(req.url);

    const estado = searchParams.get('estado'); // ABIERTA / CERRADA
    const prioridad = searchParams.get('prioridad');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const filter: any = {};
    if (estado) filter.estado = estado;
    if (prioridad) filter.prioridad = prioridad;

    const alertas = await collections.alertas
      .find(filter)
      .sort({ estado: 1, creadaEn: -1 })
      .limit(limit)
      .toArray();

    // Custom sorting: CRITICA first, then ALTA, then MEDIA
    const priorityWeight: Record<string, number> = {
      CRITICA: 1,
      ALTA: 2,
      MEDIA: 3
    };

    alertas.sort((a, b) => {
      // First open before closed
      if (a.estado !== b.estado) {
        return a.estado === 'ABIERTA' ? -1 : 1;
      }
      const weightA = priorityWeight[a.prioridad] || 99;
      const weightB = priorityWeight[b.prioridad] || 99;
      if (weightA !== weightB) return weightA - weightB;
      return new Date(b.creadaEn).getTime() - new Date(a.creadaEn).getTime();
    });

    const counts = {
      total: alertas.length,
      abiertas: alertas.filter(a => a.estado === 'ABIERTA').length,
      criticas: alertas.filter(a => a.estado === 'ABIERTA' && a.prioridad === 'CRITICA').length,
      altas: alertas.filter(a => a.estado === 'ABIERTA' && a.prioridad === 'ALTA').length,
      medias: alertas.filter(a => a.estado === 'ABIERTA' && a.prioridad === 'MEDIA').length,
    };

    return NextResponse.json({
      success: true,
      counts,
      alertas
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
