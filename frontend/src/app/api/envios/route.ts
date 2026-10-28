import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { collections } = await getDb();
    const { searchParams } = new URL(req.url);

    const estado = searchParams.get('estado');
    const zonaId = searchParams.get('zonaId');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const filter: any = {};
    if (estado) filter.estado = estado;
    if (zonaId) filter.zonaId = zonaId;
    if (search) {
      filter.shipmentId = { $regex: search, $options: 'i' };
    }

    const [envios, countsArray, total] = await Promise.all([
      collections.envios.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray(),
      collections.envios.aggregate([
        { $group: { _id: '$estado', count: { $sum: 1 } } }
      ]).toArray(),
      collections.envios.countDocuments()
    ]);

    const counters: Record<string, number> = {
      TOTAL: total,
      CREADO: 0,
      INGRESADO_HUB: 0,
      CLASIFICADO: 0,
      EN_REPARTO: 0,
      ENTREGADO: 0,
      ENTREGA_FALLIDA: 0,
      RETENIDO: 0,
      DEVUELTO_AL_COMERCIO: 0
    };

    countsArray.forEach(item => {
      if (item._id) {
        counters[item._id] = item.count;
      }
    });

    return NextResponse.json({
      success: true,
      counters,
      envios
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
