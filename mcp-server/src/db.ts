import { MongoClient, Db } from "mongodb";

const MONGO_URL = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB_NAME ?? "connact";

let client: MongoClient | undefined;
let db: Db | undefined;

/**
 * A single shared MongoClient is reused across tool calls instead of
 * opening a connection per request - this is how a real MCP server
 * would sit in front of a connection-pooled datastore.
 */
export async function getDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(MONGO_URL);
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = undefined;
  db = undefined;
}
