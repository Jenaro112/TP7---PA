import { Kafka, Producer, Consumer, EachMessagePayload, ITopicConfig, logLevel } from 'kafkajs';
import { TOPICS, EventoDLQ } from './events';

export function createKafkaClient(clientId: string): Kafka {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:29092,localhost:9092').split(',');
  return new Kafka({
    clientId,
    brokers,
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 300,
      retries: 8
    }
  });
}

export async function createProducer(kafka: Kafka): Promise<Producer> {
  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

export async function sendDLQ(
  producer: Producer,
  errorInfo: {
    shipmentId?: string;
    topicOrigen: string;
    payloadOriginal: any;
    error: string;
    consumidor: string;
  }
): Promise<void> {
  const dlqPayload: EventoDLQ = {
    eventId: errorInfo.payloadOriginal?.eventId,
    shipmentId: errorInfo.shipmentId || errorInfo.payloadOriginal?.shipmentId || 'UNKNOWN',
    topicOrigen: errorInfo.topicOrigen,
    payloadOriginal: errorInfo.payloadOriginal,
    error: errorInfo.error,
    consumidor: errorInfo.consumidor,
    recibidoEn: new Date().toISOString()
  };

  await producer.send({
    topic: TOPICS.ENVIOS_ESTADOS_DLQ,
    messages: [
      {
        key: dlqPayload.shipmentId,
        value: JSON.stringify(dlqPayload)
      }
    ]
  });
  console.warn(`[DLQ] Mensaje enviado a DLQ por consumidor=${errorInfo.consumidor}, motivo=${errorInfo.error}`);
}

export async function setupTopics(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();

  const existingTopics = await admin.listTopics();

  const topicsToCreate: ITopicConfig[] = [
    {
      topic: TOPICS.ENVIOS_ESTADOS,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'retention.ms', value: (30 * 24 * 3600 * 1000).toString() } // 30 dias
      ]
    },
    {
      topic: TOPICS.ENVIOS_PROMESAS,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'cleanup.policy', value: 'compact' }
      ]
    },
    {
      topic: TOPICS.ENVIOS_REPROGRAMACIONES,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'retention.ms', value: (30 * 24 * 3600 * 1000).toString() }
      ]
    },
    {
      topic: TOPICS.ALERTAS_SLA,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'retention.ms', value: (7 * 24 * 3600 * 1000).toString() } // 7 dias
      ]
    },
    {
      topic: TOPICS.NOTIFICACIONES_ENVIADAS,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'retention.ms', value: (7 * 24 * 3600 * 1000).toString() }
      ]
    },
    {
      topic: TOPICS.ENVIOS_ESTADOS_DLQ,
      numPartitions: 3,
      replicationFactor: 1,
      configEntries: [
        { name: 'retention.ms', value: (30 * 24 * 3600 * 1000).toString() }
      ]
    }
  ];

  const needed = topicsToCreate.filter(t => !existingTopics.includes(t.topic));
  if (needed.length > 0) {
    console.log(`[Kafka Admin] Creando topics: ${needed.map(t => t.topic).join(', ')}`);
    await admin.createTopics({
      topics: needed,
      waitForLeaders: true
    });
  } else {
    console.log('[Kafka Admin] Todos los topics existen correctamente.');
  }

  await admin.disconnect();
}
