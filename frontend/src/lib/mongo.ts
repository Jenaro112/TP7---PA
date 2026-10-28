import { MongoClient, Db } from 'mongodb';
import { getCollections, RutaSurCollections } from '@rutasur/shared';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<{ client: MongoClient; db: Db; collections: RutaSurCollections }> {
  if (!client) {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/rutasur?replicaSet=rs0&directConnection=true';
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db();
  }
  return {
    client,
    db: db!,
    collections: getCollections(db!)
  };
}
