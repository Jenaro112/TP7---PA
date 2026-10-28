import { NextRequest, NextResponse } from 'next/server';

const SIMULADOR_URL = process.env.SIMULADOR_URL || 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${SIMULADOR_URL}/config`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action; // 'config' | 'scenario'
    const endpoint = body.endpoint; // e.g. 'scenarios/feliz', 'config', etc.

    const targetUrl = `${SIMULADOR_URL}/${endpoint}`;
    const res = await fetch(targetUrl, {
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
