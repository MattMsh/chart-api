import config from '../config/index.js';
import { MongoClient } from 'mongodb';

const { MONGO_URI, DB_NAME } = config;

let db = null;

export async function getMongoDB() {
  if (!db) {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('Connected to MongoDB');
    db = client.db(DB_NAME);
  }
  return db;
}
