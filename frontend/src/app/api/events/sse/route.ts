import { NextRequest } from 'next/server';
import { getDb } from '@/lib/mongo';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  let enviosStream: any = null;
  let alertasStream: any = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller might be closed
        }
      };

      // Heartbeat
      heartbeatTimer = setInterval(() => {
        sendEvent('heartbeat', { time: new Date().toISOString() });
      }, 10000);

      try {
        const { collections } = await getDb();

        // Change stream for envios
        try {
          enviosStream = collections.envios.watch([], { fullDocument: 'updateLookup' });
          enviosStream.on('change', (change: any) => {
            sendEvent('envio-change', {
              operationType: change.operationType,
              documentKey: change.documentKey,
              doc: change.fullDocument
            });
          });
          enviosStream.on('error', (err: any) => {
            console.warn('[SSE] Error en ChangeStream de envios:', err.message);
          });
        } catch (csErr: any) {
          console.warn('[SSE] No se pudo iniciar ChangeStream en envios:', csErr.message);
        }

        // Change stream for alertas
        try {
          alertasStream = collections.alertas.watch([], { fullDocument: 'updateLookup' });
          alertasStream.on('change', (change: any) => {
            sendEvent('alerta-change', {
              operationType: change.operationType,
              documentKey: change.documentKey,
              doc: change.fullDocument
            });
          });
          alertasStream.on('error', (err: any) => {
            console.warn('[SSE] Error en ChangeStream de alertas:', err.message);
          });
        } catch (csErr: any) {
          console.warn('[SSE] No se pudo iniciar ChangeStream en alertas:', csErr.message);
        }

        sendEvent('connected', { status: 'ok', timestamp: new Date().toISOString() });
      } catch (err: any) {
        console.error('[SSE] Error al conectar a MongoDB:', err.message);
        sendEvent('error', { message: err.message });
      }
    },
    cancel() {
      isClosed = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (enviosStream) enviosStream.close().catch(() => {});
      if (alertasStream) alertasStream.close().catch(() => {});
    }
  });

  req.signal.addEventListener('abort', () => {
    isClosed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (enviosStream) enviosStream.close().catch(() => {});
    if (alertasStream) alertasStream.close().catch(() => {});
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
