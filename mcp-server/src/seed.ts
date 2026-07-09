import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In the Docker image the raw seed JSON is copied to mcp-server/seed/.
const SEED_DIR = process.env.SEED_DIR ?? path.resolve(__dirname, "..", "seed");

async function loadJson<T>(file: string): Promise<T> {
  const raw = await readFile(path.join(SEED_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * Idempotent seed: safe to run every container start. Replaces the
 * collections wholesale so the demo dataset stays consistent with the
 * checked-in seed files.
 */
async function main() {
  const db = await getDb();

  const customers = await loadJson<unknown[]>("customers.json");
  const meetings = await loadJson<unknown[]>("meetings.json");

  const customersCol = db.collection("customers");
  const meetingsCol = db.collection("meetings");

  await customersCol.deleteMany({});
  await meetingsCol.deleteMany({});

  if (customers.length) await customersCol.insertMany(customers as any[]);
  if (meetings.length) await meetingsCol.insertMany(meetings as any[]);

  await customersCol.createIndex({ customerId: 1 }, { unique: true });
  await meetingsCol.createIndex({ meetingId: 1 }, { unique: true });
  await meetingsCol.createIndex({ customerId: 1 });

  console.log(
    `[crm-mcp-server] seeded ${customers.length} customers and ${meetings.length} meetings`,
  );

  await closeDb();
}

main().catch((err) => {
  console.error("[crm-mcp-server] seed failed", err);
  process.exit(1);
});
