// apps/api/src/kafka.ts
import { Kafka, Producer } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'dwf-pos-api',
  brokers: ['localhost:9092'], // change to your Kafka host(s)
});

let producer: Producer | null = null;

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}
