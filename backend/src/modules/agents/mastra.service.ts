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
  HISTORY_SUMMARIZER_AGENT_INSTRUCTIONS,
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
 *
 * Four agents are built in `onModuleInit()`, all sharing one underlying
 * language model instance (see `createLanguageModel`/`stripTemperature` in
 * `common/llm.ts`):
 *
 * - `cloudPartnershipAgent` ("CloudPartnershipAgent") - the general-purpose
 *   chat agent behind `POST /api/chat`. The only agent with tools: RAG
 *   (`searchKnowledgeBase`) plus all five CRM tools from `crm.tools.ts`. It
 *   decides for itself, per `CLOUD_PARTNERSHIP_AGENT_INSTRUCTIONS`'s tool
 *   routing matrix, which tool(s) a question needs.
 * - `historySummarizerAgent` ("HistorySummarizerAgent") - a narrow,
 *   tool-less fast path used only when `chat()`'s `tryHandleHistoryRequest`
 *   heuristic detects a plain meeting/history question naming a specific
 *   customer. `getCustomerHistory` is called directly via MCP (bypassing
 *   the model's own tool-selection step entirely), and this agent only has
 *   to summarize the data it's handed - cheaper and more predictable than
 *   letting the general agent re-derive "call getCustomerHistory" itself.
 * - `meetingAnalysisAgent` ("MeetingAnalysisAgent") - tool-less, invoked by
 *   `analyzeMeetingTranscript()` (used by the transcription module) to pull
 *   a structured `{ summary, sentiment, actionItems, risks }` out of one
 *   raw transcript.
 * - `executiveBriefingAgent` ("ExecutiveBriefingAgent") - tool-less,
 *   exposed via `getExecutiveBriefingAgent()` and driven entirely by
 *   `WorkflowsService`/`executive-briefing.workflow.ts`, not called
 *   anywhere in this file. The workflow's own steps gather CRM + RAG
 *   context up front and hand it to this agent as one big prompt, so it
 *   never needs tools of its own.
 *
 * `chat()`'s routing algorithm, in order:
 * 1. `tryHandleHistoryRequest` - regex/keyword fast path for
 *    "meeting/history" questions that name a known customer. If it
 *    matches, `historySummarizerAgent` answers directly and the rest of
 *    `chat()` is skipped entirely.
 * 2. Otherwise, `buildCustomerToolSelectionHint` prepends a short
 *    steering note to the prompt (e.g. "don't call listCustomers, a
 *    customer was already named") and `cloudPartnershipAgent.generate()`
 *    runs with `maxSteps: 5`, free to call any of its six tools as many
 *    times as it judges necessary.
 * 3. Either way, tool calls actually made are collected (from every step
 *    of a multi-step run, not just the last - see the comment on
 *    `rawSteps` below) and reshaped into the `ChatResponse` contract the
 *    frontend's "Agent Activity View" renders.
 */
@Injectable()
export class MastraService implements OnModuleInit {
  private readonly logger = new Logger(MastraService.name);
  private mastra!: Mastra;
  private cloudPartnershipAgent!: Agent;
  private historySummarizerAgent!: Agent;
  private meetingAnalysisAgent!: Agent;
  private executiveBriefingAgent!: Agent;

  /**
   * Nest injects these singletons; nothing here talks to Mongo/Qdrant/MCP
   * directly - `vectorService`/`embeddingService` back the RAG tool and
   * `mcpClient` backs the CRM tools, both wired up in `onModuleInit()`.
   */
  constructor(
    private readonly config: ConfigService,
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly mcpClient: McpClientService,
  ) {}

  /**
   * NestJS lifecycle hook, runs exactly once at app startup (not per
   * request). Builds the one shared language model, the tool set, all four
   * agents, and a `Mastra` registry instance. `model` is a local variable
   * rather than a class field - it doesn't need to be one, since each
   * `Agent` constructor copies the reference into its own `this.model`
   * (see `@mastra/core`'s `Agent` class), so all four agents keep it alive
   * for the lifetime of this singleton service regardless of whether this
   * function still has a variable pointing at it.
   */
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
      instructions: HISTORY_SUMMARIZER_AGENT_INSTRUCTIONS,
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

  /**
   * The only way anything outside this class reaches `executiveBriefingAgent`
   * - `WorkflowsService.onModuleInit()` calls this once to hand the agent to
   * `buildExecutiveBriefingWorkflow()`, which drives it directly rather than
   * going through a method on this service.
   */
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

  /**
  reshapes the Vercel AI SDK result into the ChatResponse contract,
  it means: cloudPartnershipAgent.generate() ultimately returns whatever ai's generateText() produced:
  (.text, .toolCalls, .steps, etc.), and chat()'s job is to map that generic shape into this app's own
  ChatResponse interface for the frontend.
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

  /**
   * The "fast path" step 1 of `chat()`'s routing algorithm. Only fires when
   * the message both (a) looks like a meeting/history question (regex
   * keyword match) and (b) names a specific, recognizable customer (via
   * `extractCustomerId`). When both hold, it skips `cloudPartnershipAgent`
   * entirely: it calls `getCustomerHistory` on the MCP client directly
   * (no model-driven tool selection needed - the intent is already
   * unambiguous) and hands the raw result to the tool-less
   * `historySummarizerAgent` to turn into prose. Returns `null` (not a
   * `ChatResponse`) when the heuristic doesn't match, signaling `chat()`
   * to fall through to the general-purpose agent instead.
   */
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

  /**
   * Resolves a message to a `customerId` two ways: an explicit `cust-...`
   * ID typed in the message, or a hardcoded name-to-ID lookup table
   * (matching the six seeded demo customers) checked against the
   * lowercased message text. Returns `null` if neither matches - callers
   * treat that as "no specific customer was named."
   */
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

  /**
   * Step 2 of `chat()`'s routing algorithm, used only when
   * `tryHandleHistoryRequest` didn't already short-circuit. This doesn't
   * call any tool itself - it's a prompt-engineering nudge prepended to
   * the user's message before `cloudPartnershipAgent.generate()` runs,
   * steering the model's own tool choice: it discourages a redundant
   * `listCustomers` call when a specific customer was already named
   * (by name or `cust-...` ID), and discourages chaining an unrelated
   * profile lookup onto a pure history question. Returns `null` when
   * neither case applies, meaning no hint is added and the model's
   * built-in tool-routing instructions decide unassisted.
   */
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

  /**
   * Turns a raw tool result (whatever shape the MCP server or RAG search
   * returned) into the one-line `resultSummary` string shown per tool call
   * in the "Agent Activity View" - e.g. "Returned 3 customer(s)." instead
   * of dumping the full JSON payload. Falls back to a generic label for
   * shapes it doesn't specifically recognize, and surfaces a tool-reported
   * `error` field verbatim if present.
   */
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

  /**
   * Called by the transcription module (not by `chat()`) to extract
   * structured intelligence from one raw meeting transcript. Uses
   * `meetingAnalysisAgent` (tool-less) with `output: meetingAnalysisOutputSchema`
   * so the AI SDK requests the result as a schema-validated object rather
   * than free text - same structured-output mechanism as the executive
   * briefing workflow (see Q4/Q5 in `docs/Q & A.md` for the caveats that
   * come with structured output under this app's forced-default temperature).
   */
  async analyzeMeetingTranscript(transcript: string, contextLabel: string): Promise<MeetingAnalysisResult> {
    const prompt = `Meeting context: ${contextLabel}\n\nTranscript:\n${transcript}\n\nExtract a summary, overall sentiment, action items, and risks from this transcript.`;
    const result = await this.meetingAnalysisAgent.generate(prompt, { output: meetingAnalysisOutputSchema });
    return (result as any).object as MeetingAnalysisResult;
  }
}
