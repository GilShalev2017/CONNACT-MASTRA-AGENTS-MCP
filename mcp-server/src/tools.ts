import { getDb } from "./db.js";

/**
 * These functions simulate the business logic that, in a real deployment,
 * would live behind a CRM's own API (Salesforce, HubSpot, or an internal
 * customer platform). The MCP server is the integration boundary: the AI
 * agent never sees MongoDB, only these typed business capabilities.
 */

export async function getCustomer(customerId: string) {
  const db = await getDb();
  const customer = await db.collection("customers").findOne(
    { customerId },
    { projection: { _id: 0 } },
  );
  if (!customer) {
    return { error: `No customer found with id "${customerId}"` };
  }
  return customer;
}

export async function getCustomerHistory(customerId: string) {
  const db = await getDb();
  const meetings = await db
    .collection("meetings")
    .find({ customerId }, { projection: { _id: 0 } })
    .sort({ date: -1 })
    .toArray();

  if (!meetings.length) {
    return { customerId, meetings: [], note: "No meeting history on file for this customer." };
  }
  return { customerId, meetingCount: meetings.length, meetings };
}

export async function getMigrationOpportunities() {
  const db = await getDb();
  const customers = await db
    .collection("customers")
    .find(
      { tags: { $in: ["migration-candidate", "at-risk"] } },
      { projection: { _id: 0 } },
    )
    .sort({ monthlySpendUsd: -1 })
    .toArray();

  return {
    count: customers.length,
    opportunities: customers.map((c: any) => ({
      customerId: c.customerId,
      name: c.name,
      industry: c.industry,
      currentCloud: c.currentCloud,
      migrationInterest: c.migrationInterest,
      monthlySpendUsd: c.monthlySpendUsd,
      healthScore: c.healthScore,
      accountOwner: c.accountOwner,
      topOpportunities: c.opportunities?.slice(0, 2) ?? [],
      topChallenges: c.challenges?.slice(0, 2) ?? [],
    })),
  };
}

export async function getCustomerCloudUsage(customerId: string) {
  const db = await getDb();
  const customer = await db.collection("customers").findOne(
    { customerId },
    {
      projection: {
        _id: 0,
        customerId: 1,
        name: 1,
        currentCloud: 1,
        monthlySpendUsd: 1,
        migrationInterest: 1,
        opportunities: 1,
        healthScore: 1,
      },
    },
  );
  if (!customer) {
    return { error: `No customer found with id "${customerId}"` };
  }
  return {
    ...customer,
    annualizedSpendUsd: customer.monthlySpendUsd * 12,
  };
}

export async function listCustomers() {
  const db = await getDb();
  const customers = await db
    .collection("customers")
    .find({}, { projection: { _id: 0, customerId: 1, name: 1, industry: 1, currentCloud: 1 } })
    .toArray();
  return { count: customers.length, customers };
}
