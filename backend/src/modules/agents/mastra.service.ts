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

    const result = await this.cloudPartnershipAgent.generate(message, { maxSteps: 5 });

    const toolCalls: AgentToolCallTrace[] = [];
    const sources: RagSearchResult[] = [];

    const toolResults = ((result as any).toolResults ?? []) as Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      result: unknown;
    }>;

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
      sources,
      toolCalls,
      steps,
    };
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
