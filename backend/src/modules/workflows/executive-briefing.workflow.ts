import { createStep, createWorkflow } from "@mastra/core/workflows";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { McpClientService } from "../mcp/mcp-client.service.js";
import { VectorService } from "../vector/vector.service.js";
import { EmbeddingService } from "../vector/embedding.service.js";

const crmContextSchema = z.object({
  customerId: z.string(),
  customer: z.record(z.any()),
  history: z.record(z.any()),
});

const knowledgeContextSchema = crmContextSchema.extend({
  knowledgeExcerpts: z.array(z.object({ text: z.string(), source: z.string() })),
});

export const executiveBriefingOutputSchema = z.object({
  customerId: z.string(),
  customerName: z.string(),
  generatedAt: z.string(),
  executiveSummary: z.string(),
  keyOpportunities: z.array(z.string()),
  keyRisks: z.array(z.string()),
  recommendedActions: z.array(z.object({ action: z.string(), rationale: z.string() })),
});

/**
 * A genuine Mastra Workflow (as opposed to an ad-hoc agent tool call):
 * three explicit, typed steps run in sequence, each with its own
 * input/output schema. This is the shape used for "Prepare an executive
 * briefing for this customer" - a repeatable, auditable multi-step
 * process rather than a free-form chat turn, which is the right tool for
 * a fixed business report vs. an open-ended question.
 */
export function buildExecutiveBriefingWorkflow(deps: {
  mcpClient: McpClientService;
  vectorService: VectorService;
  embeddingService: EmbeddingService;
  briefingAgent: Agent;
}) {
  const gatherCrmContext = createStep({
    id: "gather-crm-context",
    description: "Fetch the customer's CRM profile and meeting history via the CRM MCP server",
    inputSchema: z.object({ customerId: z.string() }),
    outputSchema: crmContextSchema,
    execute: async ({ inputData }) => {
      const [customer, history] = await Promise.all([
        deps.mcpClient.callTool("getCustomer", { customerId: inputData.customerId }),
        deps.mcpClient.callTool("getCustomerHistory", { customerId: inputData.customerId }),
      ]);
      return { customerId: inputData.customerId, customer: customer as Record<string, unknown>, history: history as Record<string, unknown> };
    },
  });

  const gatherKnowledgeContext = createStep({
    id: "gather-knowledge-context",
    description: "Semantic search the RAG knowledge base for guidance relevant to this customer's profile",
    inputSchema: crmContextSchema,
    outputSchema: knowledgeContextSchema,
    execute: async ({ inputData }) => {
      const customer = inputData.customer as Record<string, any>;
      const query = `Cloud migration and optimization guidance for a ${customer.industry ?? ""} company currently on ${customer.currentCloud ?? ""} interested in ${customer.migrationInterest ?? "cloud adoption"}`;
      const queryVector = await deps.embeddingService.embedText(query);
      const results = await deps.vectorService.search(queryVector, { limit: 4 });
      return {
        ...inputData,
        knowledgeExcerpts: results.map((r) => ({ text: r.text, source: r.metadata.source })),
      };
    },
  });

  const synthesizeBriefing = createStep({
    id: "synthesize-briefing",
    description: "Use the ExecutiveBriefingAgent to synthesize a grounded executive briefing",
    inputSchema: knowledgeContextSchema,
    outputSchema: executiveBriefingOutputSchema,
    execute: async ({ inputData }) => {
      const customer = inputData.customer as Record<string, any>;
      const basePrompt = [
        `Customer CRM profile:\n${JSON.stringify(inputData.customer, null, 2)}`,
        `Meeting history:\n${JSON.stringify(inputData.history, null, 2)}`,
        `Relevant knowledge base excerpts:\n${inputData.knowledgeExcerpts.map((k) => `- (${k.source}) ${k.text}`).join("\n")}`,
        "Produce the executive briefing now.",
      ].join("\n\n");

      const schema = z.object({
        executiveSummary: z.string(),
        keyOpportunities: z.array(z.string()),
        keyRisks: z.array(z.string()),
        recommendedActions: z.array(z.object({ action: z.string(), rationale: z.string() })),
      });

      const baseBriefing = {
        customerId: inputData.customerId,
        customerName: customer.name ?? inputData.customerId,
        generatedAt: new Date().toISOString(),
        executiveSummary: "Executive briefing generation was incomplete. Please review the customer context and try again.",
        keyOpportunities: [] as string[],
        keyRisks: [] as string[],
        recommendedActions: [] as Array<{ action: string; rationale: string }>,
      };

      // The model occasionally ignores the tool schema's array types and
      // stuffs list fields (keyOpportunities, keyRisks, recommendedActions)
      // into a single XML-tagged string instead, which fails Zod
      // validation. Feed the validation error back and give it one shot
      // to self-correct before falling back to the placeholder briefing.
      let prompt = basePrompt;
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await deps.briefingAgent.generate(prompt, { output: schema });
          const object = (result as any).object ?? null;
          const parsed = object ? schema.safeParse(object) : null;

          if (parsed?.success) {
            return { ...baseBriefing, ...parsed.data };
          }

          const issue = parsed && !parsed.success ? parsed.error.message : "no object was returned";
          console.error(`[executive-briefing] attempt ${attempt} produced an invalid object:`, issue);

          prompt = [
            basePrompt,
            `Your previous response did not match the required schema: ${issue}`,
            'keyOpportunities and keyRisks must each be a JSON array of plain strings - no XML tags, no nesting, no single combined string.',
            'recommendedActions must be a JSON array of objects, each with exactly two string fields: "action" and "rationale".',
            "Call the structured output tool again with corrected values matching the schema exactly.",
          ].join("\n\n");
        } catch (error) {
          console.error(`[executive-briefing] attempt ${attempt} failed:`, error);
        }
      }

      return baseBriefing;
    },
  });

  return createWorkflow({
    id: "executive-briefing-workflow",
    inputSchema: z.object({ customerId: z.string() }),
    outputSchema: executiveBriefingOutputSchema,
  })
    .then(gatherCrmContext)
    .then(gatherKnowledgeContext)
    .then(synthesizeBriefing)
    .commit();
}
