import config from '../config/index.js';
import { MongoClient } from 'mongodb';

const { MONGO_URI, DB_NAME } = config;

export let db = null;

export async function connectMongoDB() {
  if (!db) {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(DB_NAME);
  }
  return db;
}
