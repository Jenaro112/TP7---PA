import { NextResponse } from 'next/server';
import { createKafkaClient, TOPICS } from '@rutasur/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const kafka = createKafkaClient('frontend-dlq-reader');
    const admin = kafka.admin();
    await admin.connect();

    const offsets = await admin.fetchTopicOffsets(TOPICS.ENVIOS_ESTADOS_DLQ);
    let totalMessages = 0;
    offsets.forEach(o => {
      totalMessages += Number(o.high);
    });

    const consumer = kafka.consumer({ groupId: `dlq-inspector-${Date.now()}` });
    await consumer.connect();
    await consumer.subscribe({ topic: TOPICS.ENVIOS_ESTADOS_DLQ, fromBeginning: true });

    const messages: any[] = [];
    const timeout = new Promise(resolve => setTimeout(resolve, 1500));

    const runner = consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const val = message.value?.toString();
          if (val) {
            messages.push(JSON.parse(val));
          }
        } catch {
          // ignore
        }
      }
    });

    await Promise.race([runner, timeout]);
    await consumer.disconnect();
    await admin.disconnect();

    return NextResponse.json({
      success: true,
      totalCount: totalMessages,
      items: messages.reverse().slice(0, 50)
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, items: [], error: err.message });
  }
}
