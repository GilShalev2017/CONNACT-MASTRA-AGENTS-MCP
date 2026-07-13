import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { VectorService } from "../vector/vector.service.js";
import { EmbeddingService } from "../vector/embedding.service.js";
import { McpClientService } from "../mcp/mcp-client.service.js";
import { createLanguageModel } from "../../common/llm.js";
import { createSearchKnowledgeBaseTool } from "./tools/rag.tool.js";
import { createCrmTools } from "./tools/crm.tools.js";
import {
  CLOUD_PARTNERSHIP_AGENT_INSTRUCTIONS,
  MEETING_ANALYSIS_AGENT_INSTRUCTIONS,
  EXECUTIVE_BRIEFING_AGENT_INSTRUCTIONS,
} from "./agent.config.js";
import { AgentStep, AgentToolCallTrace, ChatResponse } from "../../common/interfaces/agent.interfaces.js";
import { RagSearchResult } from "../../common/interfaces/rag.interfaces.js";

const meetingAnalysisOutputSchema = z.object({
  summary: z.string(),
  sentiment: z.string(),
  actionItems: z.array(z.string()),
  risks: z.array(z.string()),
});

export type MeetingAnalysisResult = z.infer<typeof meetingAnalysisOutputSchema>;

const executiveBriefingOutputSchema = z.object({
  executiveSummary: z.string(),
  keyOpportunities: z.array(z.string()),
  keyRisks: z.array(z.string()),
  recommendedActions: z.array(
    z.object({
      action: z.string(),
      rationale: z.string(),
    }),
  ),
});

export type ExecutiveBriefingContent = z.infer<typeof executiveBriefingOutputSchema>;

/**
 * Owns the Mastra runtime: builds every agent this app uses and is the
 * single place `agent.generate(...)` gets called. Keeping this as one
 * service (rather than scattering `new Agent(...)` calls across modules)
 * means there is one obvious place to add memory, evals, or a new agent.
 */
@Injectable()
export class MastraService implements OnModuleInit {
  private readonly logger = new Logger(MastraService.name);
  private mastra!: Mastra;
  private cloudPartnershipAgent!: Agent;
  private historySummarizerAgent!: Agent;
  private meetingAnalysisAgent!: Agent;
  private executiveBriefingAgent!: Agent;

  constructor(
    private readonly config: ConfigService,
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly mcpClient: McpClientService,
  ) {}

  async onModuleInit() {
    const model = await createLanguageModel(this.config);

    const searchKnowledgeBase = createSearchKnowledgeBaseTool(this.vectorService, this.embeddingService);
    const crmTools = createCrmTools(this.mcpClient);

    this.cloudPartnershipAgent = new Agent({
      name: "CloudPartnershipAgent",
      instructions: CLOUD_PARTNERSHIP_AGENT_INSTRUCTIONS,
      model,
      tools: { searchKnowledgeBase, ...crmTools },
    });

    this.historySummarizerAgent = new Agent({
      name: "HistorySummarizerAgent",
      instructions:
        "You answer questions from structured CRM meeting-history data. Use only the provided data. Do not call any tools or invent details.",
      model,
    });

    this.meetingAnalysisAgent = new Agent({
      name: "MeetingAnalysisAgent",
      instructions: MEETING_ANALYSIS_AGENT_INSTRUCTIONS,
      model,
    });

    this.executiveBriefingAgent = new Agent({
      name: "ExecutiveBriefingAgent",
      instructions: EXECUTIVE_BRIEFING_AGENT_INSTRUCTIONS,
      model,
    });

    this.mastra = new Mastra({
      agents: {
        cloudPartnershipAgent: this.cloudPartnershipAgent,
        meetingAnalysisAgent: this.meetingAnalysisAgent,
        executiveBriefingAgent: this.executiveBriefingAgent,
      },
      logger: false as any,
    });

    this.logger.log("Mastra agents initialized: CloudPartnershipAgent, MeetingAnalysisAgent, ExecutiveBriefingAgent");
  }

  getExecutiveBriefingAgent(): Agent {
    return this.executiveBriefingAgent;
  }

  /**
   * Runs the main chat agent and reshapes the Vercel AI SDK result into
   * the ChatResponse contract the frontend's chat + agent-activity view
   * consume. Tool calls/results come straight from the SDK's own record
   * of what happened - this is not the model's chain-of-thought, it's the
   * factual list of tool invocations, which is what "Agent Activity View"
   * is supposed to show.
   */
  async chat(message: string, conversationId?: string): Promise<ChatResponse> {
    const convId = conversationId ?? randomUUID();
    const startedAt = Date.now();

    const directHistoryReply = await this.tryHandleHistoryRequest(message, convId, startedAt);
    if (directHistoryReply) {
      return directHistoryReply;
    }

    const customerHint = this.buildCustomerToolSelectionHint(message);
    const prompt = customerHint ? `${customerHint}\n\nUser question: ${message}` : message;
    const result = await this.cloudPartnershipAgent.generate(prompt, { maxSteps: 5 });

    const toolCalls: AgentToolCallTrace[] = [];
    const sources: RagSearchResult[] = [];

    // `result.toolResults` only reflects the *last* step of a multi-step
    // run - when the final step is pure text synthesis (no new tool
    // calls), it's empty even though earlier steps called tools. Collect
    // from every step instead.
    const rawSteps = ((result as any).steps ?? []) as Array<{
      toolResults?: Array<{
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        result: unknown;
      }>;
    }>;
    const toolResults = rawSteps.flatMap((step) => step.toolResults ?? []);

    for (const tr of toolResults) {
      const resultSummary = this.summarizeToolResult(tr.toolName, tr.result);
      toolCalls.push({
        tool: tr.toolName,
        args: tr.args,
        resultSummary,
        durationMs: 0,
      });

      if (tr.toolName === "searchKnowledgeBase" && tr.result && typeof tr.result === "object") {
        const ragResults = (tr.result as { results?: Array<Record<string, unknown>> }).results ?? [];
        for (const r of ragResults) {
          sources.push({
            id: randomUUID(),
            text: String(r.text ?? ""),
            score: Number(r.score ?? 0),
            metadata: {
              source: String(r.source ?? "unknown"),
              documentType: String(r.documentType ?? "unknown"),
              customerId: r.customerId as string | undefined,
              documentId: "",
              chunkIndex: 0,
              createdAt: "",
            },
          });
        }
      }
    }

    const steps: AgentStep[] = [{ label: "Understood question", detail: "Parsed the user's request and planned which tools to use." }];
    for (const call of toolCalls) {
      steps.push({ label: `Executed tool: ${call.tool}`, detail: call.resultSummary });
    }
    steps.push({
      label: "Synthesized answer",
      detail: `Generated a grounded response in ${Date.now() - startedAt}ms using ${toolCalls.length} tool call(s).`,
    });

    return {
      conversationId: convId,
      answer: result.text,
      agentName: this.cloudPartnershipAgent.name,
      sources,
      toolCalls,
      steps,
    };
  }

  private async tryHandleHistoryRequest(message: string, conversationId: string, startedAt: number): Promise<ChatResponse | null> {
    const normalized = message.toLowerCase();
    const asksForHistory = /(meeting|meetings|history|transcript|transcripts|discussion|discussions|call|calls|conversation|conversations|summarize.*meeting|latest discussion)/i.test(message);
    const customerId = this.extractCustomerId(message);

    if (!asksForHistory || !customerId) {
      return null;
    }

    const historyResult = await this.mcpClient.callTool("getCustomerHistory", { customerId });
    const answerPrompt = [
      `User question: ${message}`,
      `Customer ID: ${customerId}`,
      "CRM meeting history:",
      JSON.stringify(historyResult, null, 2),
      "Answer the user's question concisely using only the provided meeting-history data. Do not call tools or invent facts.",
    ].join("\n\n");

    const result = await this.historySummarizerAgent.generate(answerPrompt, { maxSteps: 1 });

    return {
      conversationId,
      answer: result.text,
      agentName: this.historySummarizerAgent.name,
      sources: [],
      toolCalls: [
        {
          tool: "getCustomerHistory",
          args: { customerId },
          resultSummary: this.summarizeToolResult("getCustomerHistory", historyResult),
          durationMs: 0,
        },
      ],
      steps: [
        { label: "Understood question", detail: "Matched the request to a customer-history lookup." },
        { label: "Executed tool: getCustomerHistory", detail: this.summarizeToolResult("getCustomerHistory", historyResult) },
        {
          label: "Synthesized answer",
          detail: `Generated a grounded response in ${Date.now() - startedAt}ms using 1 tool call(s).`,
        },
      ],
    };
  }

  private extractCustomerId(message: string): string | null {
    const customerIdMatch = message.match(/\b(cust-[a-z0-9-]+)\b/i);
    if (customerIdMatch) return customerIdMatch[1];

    const customerNames = [
      { name: "acme manufacturing", customerId: "cust-acme-mfg" },
      { name: "northwind retail group", customerId: "cust-northwind-retail" },
      { name: "heliocare health systems", customerId: "cust-heliocare-health" },
      { name: "fintrust regional bank", customerId: "cust-fintrust-bank" },
      { name: "summit logistics", customerId: "cust-summit-logistics" },
      { name: "brightwave media", customerId: "cust-brightwave-media" },
    ];

    const normalized = message.toLowerCase();
    const match = customerNames.find(({ name }) => normalized.includes(name));
    return match?.customerId ?? null;
  }

  private buildCustomerToolSelectionHint(message: string): string | null {
    const normalized = message.toLowerCase();
    const asksForHistory = /(meeting|meetings|history|transcript|transcripts|discussion|discussions|call|calls|conversation|conversations|summarize.*meeting|latest discussion)/i.test(message);
    const asksForProfile = /(profile|account|industry|cloud|spend|opportunities|challenges|health score|owner|migration interest|current cloud)/i.test(message);

    if (asksForHistory && !asksForProfile) {
      return "The user is asking about meeting history or past discussions. Prefer getCustomerHistory only and avoid a follow-up customer profile lookup unless the prompt explicitly asks for account profile, spend, cloud usage, or opportunities.";
    }

    const customerMatches = [
      { name: "acme manufacturing", customerId: "cust-acme-mfg" },
      { name: "northwind retail group", customerId: "cust-northwind-retail" },
      { name: "heliocare health systems", customerId: "cust-heliocare-health" },
      { name: "fintrust regional bank", customerId: "cust-fintrust-bank" },
      { name: "summit logistics", customerId: "cust-summit-logistics" },
      { name: "brightwave media", customerId: "cust-brightwave-media" },
    ].filter(({ name }) => normalized.includes(name));

    if (customerMatches.length > 0) {
      const match = customerMatches[0];
      return [
        `The user explicitly mentioned customer "${match.name}" (customerId: ${match.customerId}).`,
        "For this request, do not call listCustomers.",
        "Use the customer-specific CRM tools instead: getCustomer, getCustomerHistory, or getCustomerCloudUsage.",
      ].join(" ");
    }

    const customerIdMatch = message.match(/\b(cust-[a-z0-9-]+)\b/i);
    if (customerIdMatch) {
      return [
        `The user explicitly mentioned customerId "${customerIdMatch[1]}".`,
        "For this request, do not call listCustomers.",
        "Use the customer-specific CRM tools instead: getCustomer, getCustomerHistory, or getCustomerCloudUsage.",
      ].join(" ");
    }

    return null;
  }

  private summarizeToolResult(toolName: string, result: unknown): string {
    if (!result || typeof result !== "object") return "No structured result returned.";
    if (toolName === "searchKnowledgeBase") {
      const count = (result as { results?: unknown[] }).results?.length ?? 0;
      return `Found ${count} relevant knowledge base chunk(s).`;
    }
    if ((result as { error?: string }).error) return (result as { error: string }).error;
    if (Array.isArray((result as { customers?: unknown[] }).customers)) {
      return `Returned ${(result as { customers: unknown[] }).customers.length} customer(s).`;
    }
    if (Array.isArray((result as { opportunities?: unknown[] }).opportunities)) {
      return `Returned ${(result as { opportunities: unknown[] }).opportunities.length} opportunity record(s).`;
    }
    if (Array.isArray((result as { meetings?: unknown[] }).meetings)) {
      return `Returned ${(result as { meetings: unknown[] }).meetings.length} meeting record(s).`;
    }
    return "Returned a CRM record.";
  }

  async analyzeMeetingTranscript(transcript: string, contextLabel: string): Promise<MeetingAnalysisResult> {
    const prompt = `Meeting context: ${contextLabel}\n\nTranscript:\n${transcript}\n\nExtract a summary, overall sentiment, action items, and risks from this transcript.`;
    const result = await this.meetingAnalysisAgent.generate(prompt, { output: meetingAnalysisOutputSchema });
    return (result as any).object as MeetingAnalysisResult;
  }
}
