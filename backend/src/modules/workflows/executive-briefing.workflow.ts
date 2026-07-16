import { createStep, createWorkflow } from "@mastra/core/workflows";
import { Agent } from "@mastra/core/agent";
import { NoObjectGeneratedError } from "ai";
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

/**
 * `Agent.generate()` throws a `MastraError` wrapping `AI_NoObjectGeneratedError`
 * wrapping `AI_TypeValidationError` when the model's structured-output
 * response fails the AI SDK's own schema check - the itemized "expected
 * array, received string"-style detail lives several `.cause` levels
 * deep, not on the top-level error's own `.message`. Walk the chain so
 * both logs and the retry loop's corrective prompt get the useful part.
 */
function describeGenerationError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  let current: unknown = error;
  let deepest = error.message;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    deepest = current.message;
    current = (current as { cause?: unknown }).cause;
  }
  return deepest;
}

/**
 * When the AI SDK's own internal schema check fails, it throws
 * `NoObjectGeneratedError` *before* `Agent.generate()` ever returns
 * anything to us - so the happy-path recovery below (on `result.object`)
 * never runs for this case, even though `NoObjectGeneratedError` itself
 * carries the raw generated `.text`. Walk the thrown error's `.cause`
 * chain looking for it, parse that raw text back into an object, and
 * hand it to the same recovery path a successful-but-malformed
 * `result.object` would have gone through.
 */
function extractRawObjectFromThrownError(error: unknown): Record<string, unknown> | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (NoObjectGeneratedError.isInstance(current) && current.text) {
      try {
        return JSON.parse(current.text);
      } catch {
        return null;
      }
    }
    current = current instanceof Error ? (current as { cause?: unknown }).cause : undefined;
  }
  return null;
}

/**
 * The model has a recurring, hard-to-prompt-away quirk (seen repeatedly
 * in production use, even after feeding the schema error back on retry):
 * instead of a real JSON array, it sometimes emits a single string with
 * items wrapped in ad-hoc XML-like tags, e.g.
 * `"\n<opp>First item</opp>\n<opp>Second item</opp>\n"`. A rarer variant
 * emits a real JSON array literal but wraps it in stray junk, e.g.
 * `"\n<parameter name=\"keyOpportunities\">[\"First\", \"Second\"]"`
 * (no closing tag, looks like a leaked/hallucinated tool-call format
 * from a different prompting convention). Retrying costs an extra LLM
 * round trip and isn't reliable - both shapes are consistent enough to
 * recover deterministically. Returns the original value unchanged if
 * neither pattern matches, so a genuine validation failure (e.g. the
 * field was never generated at all) still falls through to the retry
 * loop as before.
 */
function recoverTaggedStringArray(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const tagMatches = [...value.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)];
  if (tagMatches.length > 0) {
    const items = tagMatches.map((m) => m[2].trim()).filter(Boolean);
    if (items.length > 0) return items;
  }

  const bracketMatch = value.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      // fall through - leave value unchanged
    }
  }

  return value;
}

/**
 * Same quirk as `recoverTaggedStringArray`, but for `recommendedActions`
 * - an array of `{ action, rationale }` objects rather than plain
 * strings. Observed shapes nest an `<action>`/`<rationale>` pair per
 * item (optionally inside an outer wrapper tag); rather than depend on
 * the exact wrapper name, pull every `<action>`/`<rationale>` tag in
 * document order and zip them pairwise.
 */
function recoverTaggedActionArray(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const actions = [...value.matchAll(/<action>([\s\S]*?)<\/action>/g)].map((m) => m[1].trim());
  const rationales = [...value.matchAll(/<rationale>([\s\S]*?)<\/rationale>/g)].map((m) => m[1].trim());
  if (actions.length > 0 && actions.length === rationales.length) {
    return actions.map((action, i) => ({ action, rationale: rationales[i] }));
  }

  const bracketMatch = value.match(/\[[\s\S]*\]/);
  if (bracketMatch) {
    try {
      const parsed = JSON.parse(bracketMatch[0]);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => item && typeof item.action === "string" && typeof item.rationale === "string")
      ) {
        return parsed;
      }
    } catch {
      // fall through - leave value unchanged
    }
  }

  return value;
}

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
  // Failure handling here used to always return a placeholder object
  // instead of throwing, which meant Mastra never saw this step as
  // "failed" - but that let a failed *re-generation* silently overwrite
  // a previously good, already-persisted briefing for the same customer
  // (WorkflowsService.briefingsByCustomer.set() runs unconditionally on
  // whatever comes back as "successful"). Now this step throws after
  // exhausting its retries, same as steps 1/2: an uncaught throw here
  // becomes a Mastra-level step failure, halts the chain, and makes
  // run.start() report status "failed" - WorkflowsService's existing
  // `if (result.status !== "success") throw` then fires *before*
  // reaching the briefingsByCustomer.set() line, so a prior good
  // briefing for this customer is never touched by a failed attempt.
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
        'keyOpportunities and keyRisks must be actual JSON arrays of plain strings - never a single string, and never wrapped in XML-like tags such as <opp> or <item>.',
        'recommendedActions must be a JSON array of objects with exactly two string fields, "action" and "rationale" - never a string, never XML-tagged.',
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
      };

      // Applies the deterministic tag-recovery to a raw object (whether
      // it came back as `result.object` or was pulled out of a thrown
      // NoObjectGeneratedError's raw text) and validates the result -
      // shared by both the happy path and the catch block below.
      function recoverAndParse(object: Record<string, unknown>) {
        object.keyOpportunities = recoverTaggedStringArray(object.keyOpportunities);
        object.keyRisks = recoverTaggedStringArray(object.keyRisks);
        object.recommendedActions = recoverTaggedActionArray(object.recommendedActions);
        return schema.safeParse(object);
      }

      // The model occasionally ignores the tool schema's array types and
      // stuffs list fields (keyOpportunities, keyRisks, recommendedActions)
      // into a single XML-tagged string instead, which fails Zod
      // validation - either returned as a malformed object (caught below
      // via schema.safeParse) or thrown directly out of generate() as
      // AI_NoObjectGeneratedError (caught in the catch block). Both paths
      // now feed the failure detail back into the next attempt's prompt.
      let prompt = basePrompt;
      let lastIssue = "no object was returned";
      // 2 wasn't enough in practice - live testing showed individual
      // attempts succeed cleanly most of the time, so a 3rd attempt
      // meaningfully raises the odds of landing a valid response instead
      // of exhausting retries on back-to-back unlucky generations.
      const maxAttempts = 3;
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
          const object = (result as any).object as Record<string, unknown> | null | undefined;
          const parsed = object ? recoverAndParse(object) : null;

          if (parsed?.success) {
            return { ...baseBriefing, ...parsed.data };
          }

          lastIssue = parsed && !parsed.success ? parsed.error.message : "no object was returned";
          console.error(`[executive-briefing] attempt ${attempt} produced an invalid object:`, lastIssue);
        } catch (error) {
          // Most real failures land here: the AI SDK's own internal
          // schema check rejects the response and throws before
          // Agent.generate() ever returns `result.object` to us - so the
          // happy-path recovery above never even runs. Recover the raw
          // text out of the thrown error and try the same repair here.
          const rawObject = extractRawObjectFromThrownError(error);
          const recovered = rawObject ? recoverAndParse(rawObject) : null;
          if (recovered?.success) {
            return { ...baseBriefing, ...recovered.data };
          }

          lastIssue = describeGenerationError(error);
          console.error(`[executive-briefing] attempt ${attempt} failed:`, lastIssue);
        }

        prompt = [
          basePrompt,
          `Your previous response did not match the required schema: ${lastIssue}`,
          'keyOpportunities and keyRisks must each be a JSON array of plain strings - no XML tags, no nesting, no single combined string.',
          'recommendedActions must be a JSON array of objects, each with exactly two string fields: "action" and "rationale".',
          "Call the structured output tool again with corrected values matching the schema exactly.",
        ].join("\n\n");
      }

      // Every attempt failed - throw rather than return a placeholder, so
      // Mastra marks this step (and the whole run) "failed" instead of a
      // fake "success" that would otherwise overwrite a previously good
      // briefing for this customer (see the comment above this step).
      throw new Error(`Failed to generate a valid executive briefing after ${maxAttempts} attempts: ${lastIssue}`);
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
