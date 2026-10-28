import { createKafkaClient, setupTopics } from '@rutasur/shared';

async function main() {
  const kafka = createKafkaClient('topic-initializer');
  console.log('Verificando y creando topics en Kafka...');
  await setupTopics(kafka);
  console.log('Topics creados y configurados correctamente.');
}

main().catch(err => {
  console.error('Error inicializando topics:', err);
  process.exit(1);
});
