import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  getCustomer,
  getCustomerHistory,
  getMigrationOpportunities,
  getCustomerCloudUsage,
  listCustomers,
} from "./tools.js";

const PORT = Number(process.env.PORT ?? 4100);

/**
 * crm-mcp-server
 * ---------------
 * A standalone MCP server that exposes CRM/customer business capabilities
 * as MCP tools over HTTP (Streamable HTTP transport). This is the piece
 * that, in production, would be swapped for a real integration with
 * Salesforce, HubSpot, or an internal customer platform - the Mastra
 * agent talks to this server through the MCP protocol and never touches
 * MongoDB directly. That boundary is the whole point of MCP here: the
 * agent gets a stable, typed tool contract regardless of what sits behind
 * it.
 */
function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "crm-mcp-server", version: "1.0.0" });

  server.registerTool(
    "getCustomer",
    {
      title: "Get Customer",
      description:
        "Fetch full CRM profile for a single customer by their customerId, including industry, current cloud provider, spend, migration interest, challenges and opportunities.",
      inputSchema: { customerId: z.string().describe("The customer's unique CRM id, e.g. cust-acme-mfg") },
    },
    async ({ customerId }) => {
      const result = await getCustomer(customerId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "getCustomerHistory",
    {
      title: "Get Customer Meeting History",
      description:
        "Fetch the chronological meeting history for a customer, including transcripts, summaries, sentiment, action items and risks captured from past customer calls.",
      inputSchema: { customerId: z.string().describe("The customer's unique CRM id") },
    },
    async ({ customerId }) => {
      const result = await getCustomerHistory(customerId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "getMigrationOpportunities",
    {
      title: "Get Migration Opportunities",
      description:
        "List customers flagged as migration candidates or at-risk of churning to a competitor, ranked by monthly spend, with their top opportunities and challenges. Use this to answer questions about which customers to prioritize.",
      inputSchema: {},
    },
    async () => {
      const result = await getMigrationOpportunities();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "getCustomerCloudUsage",
    {
      title: "Get Customer Cloud Usage",
      description:
        "Fetch a customer's current cloud provider, monthly and annualized spend, health score, and cloud opportunities. Use this for cost/spend-focused questions.",
      inputSchema: { customerId: z.string().describe("The customer's unique CRM id") },
    },
    async ({ customerId }) => {
      const result = await getCustomerCloudUsage(customerId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.registerTool(
    "listCustomers",
    {
      title: "List Customers",
      description: "List all customers with their id, name, industry, and current cloud provider. Use this to discover valid customerId values.",
      inputSchema: {},
    },
    async () => {
      const result = await listCustomers();
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}

async function main() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "crm-mcp-server", requestId: randomUUID() });
  });

  // Stateless MCP endpoint: a fresh server + transport per request. This
  // keeps the demo simple (no session affinity needed behind a load
  // balancer) at the cost of not supporting server-initiated push between
  // calls, which this CRM use case doesn't need.
  app.post("/mcp", async (req, res) => {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[crm-mcp-server] MCP request failed", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.listen(PORT, () => {
    console.log(`[crm-mcp-server] listening on http://localhost:${PORT}/mcp`);
  });
}

main().catch((err) => {
  console.error("[crm-mcp-server] fatal startup error", err);
  process.exit(1);
});
