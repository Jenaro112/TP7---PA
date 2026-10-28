import { NextRequest, NextResponse } from 'next/server';

const ANALITICA_URL = process.env.ANALITICA_URL || 'http://localhost:3002';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get('path') || 'metricas';
    const queryString = searchParams.toString();

    const res = await fetch(`${ANALITICA_URL}/${path}?${queryString}`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path = body.path || 'reprocess';

    const res = await fetch(`${ANALITICA_URL}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body.payload || {})
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 502 });
  }
}
