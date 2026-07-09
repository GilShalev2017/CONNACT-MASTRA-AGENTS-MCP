import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { McpClientService } from "../../mcp/mcp-client.service.js";

/**
 * Thin Mastra tool wrappers around the MCP client. Each tool here maps
 * 1:1 to a tool exposed by crm-mcp-server (see mcp-server/src/server.ts) -
 * the agent calls these, these call MCP, MCP calls the "CRM". The agent
 * process never imports MongoDB or the CRM's internal representation.
 */
export function createCrmTools(mcpClient: McpClientService) {
  const getCustomer = createTool({
    id: "getCustomer",
    description: "Fetch a single customer's full CRM profile by customerId (industry, cloud, spend, challenges, opportunities).",
    inputSchema: z.object({ customerId: z.string() }),
    execute: async ({ context }) => mcpClient.callTool("getCustomer", { customerId: context.customerId }),
  });

  const getCustomerHistory = createTool({
    id: "getCustomerHistory",
    description: "Fetch a customer's meeting history, including transcripts, summaries, sentiment, action items, and risks.",
    inputSchema: z.object({ customerId: z.string() }),
    execute: async ({ context }) => mcpClient.callTool("getCustomerHistory", { customerId: context.customerId }),
  });

  const getMigrationOpportunities = createTool({
    id: "getMigrationOpportunities",
    description: "List customers flagged as migration candidates or churn-risk, ranked by monthly spend. Use for 'which customers should we prioritize' questions.",
    inputSchema: z.object({}),
    execute: async () => mcpClient.callTool("getMigrationOpportunities", {}),
  });

  const getCustomerCloudUsage = createTool({
    id: "getCustomerCloudUsage",
    description: "Fetch a customer's current cloud provider, monthly/annualized spend, health score, and cloud opportunities.",
    inputSchema: z.object({ customerId: z.string() }),
    execute: async ({ context }) => mcpClient.callTool("getCustomerCloudUsage", { customerId: context.customerId }),
  });

  const listCustomers = createTool({
    id: "listCustomers",
    description: "List all customers with id, name, industry, and current cloud provider. Use to discover valid customerId values.",
    inputSchema: z.object({}),
    execute: async () => mcpClient.callTool("listCustomers", {}),
  });

  return { getCustomer, getCustomerHistory, getMigrationOpportunities, getCustomerCloudUsage, listCustomers };
}
