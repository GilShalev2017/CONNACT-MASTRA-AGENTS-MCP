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
  // --- Step 1: gather-crm-context -----------------------------------------
  // inputSchema is just { customerId } - the raw input the whole workflow
  // starts with (matches createWorkflow's own inputSchema below). No local
  // try/catch here: if either MCP call throws (e.g. crm-mcp-server is
  // down), the error propagates out of execute() uncaught. Mastra's own
  // execution engine wraps every step's execute() in a try/catch - an
  // uncaught throw here is what Mastra itself turns into
  // `{ status: "failed", error }` for this step, which halts the chain
  // (gatherKnowledgeContext/synthesizeBriefing never run) and makes
  // run.start() resolve with WorkflowResult.status === "failed" instead of
  // rejecting. WorkflowsService.generateExecutiveBriefing() checks exactly
  // that status and throws, which the controller/LlmErrorFilter turns into
  // a 500 - so a step-1 failure here is a hard stop for the whole briefing.
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

  // --- Step 2: gather-knowledge-context ------------------------------------
  // inputSchema here is literally `crmContextSchema` - the exact same Zod
  // schema step 1 declared as its outputSchema. That's the chaining
  // mechanism `.then()` relies on below: each step's inputSchema must
  // match the previous step's outputSchema, so `inputData` here is
  // guaranteed (by that shared schema, not by any check in this function)
  // to already contain step 1's { customerId, customer, history }. This
  // step then adds one field (`knowledgeExcerpts`) on top via
  // `knowledgeContextSchema = crmContextSchema.extend({ ... })`. Same
  // failure story as step 1: no local retry/catch - an uncaught throw
  // (e.g. Qdrant unreachable) becomes a Mastra-level step failure and
  // halts the chain before synthesizeBriefing ever runs.
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

  // --- Step 3: synthesize-briefing ------------------------------------
  // inputSchema is `knowledgeContextSchema` - step 2's outputSchema,
  // same chaining pattern as step 2. outputSchema is the workflow's own
  // final `executiveBriefingOutputSchema`, since this is the last step.
  //
  // Failure handling here is deliberately NOT the same as steps 1/2: this
  // execute() has its own internal try/catch (see the retry loop below)
  // and *never* lets an error escape uncaught - it always `return`s a
  // valid object matching outputSchema, even in the worst case
  // (`baseBriefing`, the "incomplete" placeholder). That means Mastra's
  // execution engine always sees this step as `status: "success"`, never
  // "failed" - unlike steps 1/2, a bad LLM response here can never halt
  // the workflow or make run.start() report status "failed". The
  // tradeoff: WorkflowsService/the caller has no way to distinguish "the
  // briefing genuinely has no opportunities" from "generation failed
  // twice and this is a placeholder" except by eyeballing the
  // placeholder's literal executiveSummary text.
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
          // deps.briefingAgent is the tool-less ExecutiveBriefingAgent
          // (Q15 in docs/Q & A.md - a "plain" agent, no tools/autonomy).
          // All the actual data gathering already happened in steps 1-2;
          // this call's only job is to turn the fully-assembled `prompt`
          // (CRM profile + meeting history + knowledge excerpts, already
          // stringified above) into the structured briefing text. Passing
          // `{ output: schema }` asks the AI SDK to coerce the model's
          // reply into a schema-validated object (`result.object`)
          // instead of free text - the same structured-generation
          // mechanism covered in Q2/Q16, which is exactly what
          // occasionally fails and is what this retry loop exists to
          // recover from.
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

  // Schema chain: workflow inputSchema -> gatherCrmContext.outputSchema
  // (crmContextSchema) -> gatherKnowledgeContext.inputSchema (same
  // schema) -> gatherKnowledgeContext.outputSchema (knowledgeContextSchema)
  // -> synthesizeBriefing.inputSchema (same schema) ->
  // synthesizeBriefing.outputSchema (executiveBriefingOutputSchema) ->
  // workflow outputSchema. Each `.then()` requires the two adjoining
  // schemas to match, so the chain is both the runtime data pipe and a
  // compile-time guarantee the steps actually fit together.
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
