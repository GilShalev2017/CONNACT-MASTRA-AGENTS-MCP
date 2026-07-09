import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: unknown;
}

/**
 * The only piece of the backend that speaks the Model Context Protocol.
 * The Mastra agent never calls MongoDB or the CRM directly - it calls
 * this client, which speaks MCP to the standalone crm-mcp-server process
 * (see /mcp-server). That boundary is the whole point of using MCP here:
 * the agent gets a stable, discoverable tool contract, and the business
 * system behind it (today: a MongoDB-backed simulation; tomorrow:
 * Salesforce or an internal API) can change without the agent noticing.
 */
@Injectable()
export class McpClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private client!: Client;
  private connected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    if (this.connected) await this.client.close();
  }

  private async connect(): Promise<void> {
    const url = this.config.get<string>("mcp.crmServerUrl")!;
    this.client = new Client({ name: "connact-backend", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(url));
    try {
      await this.client.connect(transport);
      this.connected = true;
      this.logger.log(`Connected to CRM MCP server at ${url}`);
    } catch (err) {
      this.connected = false;
      this.logger.warn(`Could not connect to CRM MCP server at ${url} yet: ${(err as Error).message}`);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.connected) await this.connect();
  }

  async listTools(): Promise<McpToolDescriptor[]> {
    await this.ensureConnected();
    const result = await this.client.listTools();
    return result.tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema }));
  }

  /**
   * Calls an MCP tool by name and returns the parsed JSON payload the
   * crm-mcp-server tools return as their text content.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    const result = await this.client.callTool({ name, arguments: args });
    const content = (result.content as Array<{ type: string; text?: string }>) ?? [];
    const textPart = content.find((c) => c.type === "text");
    if (!textPart?.text) return null;
    try {
      return JSON.parse(textPart.text);
    } catch {
      return textPart.text;
    }
  }
}
