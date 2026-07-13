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
    description: "Fetch a single customer's full CRM profile by customerId (industry, cloud, spend, challenges, opportunities). Use this when the user explicitly asks for account profile, spend, cloud context, or opportunities; do not use it as a follow-up to a history-only question.",
    inputSchema: z.object({ customerId: z.string() }),
    execute: async ({ context }) => mcpClient.callTool("getCustomer", { customerId: context.customerId }),
  });

  const getCustomerHistory = createTool({
    id: "getCustomerHistory",
    description: "Fetch a customer's meeting history, including transcripts, summaries, sentiment, action items, and risks. Prefer this for questions about past meetings, discussions, or conversation summaries.",
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
    description: "List all customers with id, name, industry, and current cloud provider. Only use when the user asks for a customer inventory, portfolio overview, or needs help discovering valid customerIds; do not use it when a specific customer is already named.",
    inputSchema: z.object({}),
    execute: async () => mcpClient.callTool("listCustomers", {}),
  });

  return { getCustomer, getCustomerHistory, getMigrationOpportunities, getCustomerCloudUsage, listCustomers };
}
