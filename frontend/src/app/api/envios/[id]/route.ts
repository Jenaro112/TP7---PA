import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { collections } = await getDb();
    const shipmentId = params.id;

    const [envio, alertas, notificaciones] = await Promise.all([
      collections.envios.findOne({ shipmentId }),
      collections.alertas.find({ shipmentId }).sort({ ocurridoEn: -1 }).toArray(),
      collections.notificaciones.find({ shipmentId }).sort({ ocurridoEn: -1 }).toArray()
    ]);

    if (!envio) {
      return NextResponse.json(
        { success: false, error: `Envío ${shipmentId} no encontrado.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      envio,
      alertas,
      notificaciones
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
