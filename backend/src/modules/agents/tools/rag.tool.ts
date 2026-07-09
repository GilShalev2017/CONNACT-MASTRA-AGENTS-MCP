import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { VectorService } from "../../vector/vector.service.js";
import { EmbeddingService } from "../../vector/embedding.service.js";

/**
 * The agent's one and only entry point into the RAG pipeline. It embeds
 * the query with the same local model used at ingestion time, searches
 * Qdrant, and returns plain-text chunks with their source metadata so the
 * agent (and the frontend's "sources" panel) can cite where an answer
 * came from.
 */
export function createSearchKnowledgeBaseTool(vectorService: VectorService, embeddingService: EmbeddingService) {
  return createTool({
    id: "searchKnowledgeBase",
    description:
      "Semantic search over the RAG knowledge base: internal migration guides, architecture recommendations, security/compliance guidance, FinOps playbooks, uploaded customer documents, and meeting transcripts. Use this for conceptual/technical questions or to find grounding context for a customer.",
    inputSchema: z.object({
      query: z.string().describe("Natural-language search query"),
      customerId: z.string().optional().describe("Restrict results to a specific customer's documents/transcripts"),
      documentType: z
        .string()
        .optional()
        .describe("Restrict to a document type, e.g. 'migration-guide', 'security-guide', 'meeting-transcript'"),
      limit: z.number().optional().describe("Max results to return, default 5"),
    }),
    outputSchema: z.object({
      results: z.array(
        z.object({
          text: z.string(),
          score: z.number(),
          source: z.string(),
          documentType: z.string(),
          customerId: z.string().optional(),
        }),
      ),
    }),
    execute: async ({ context }) => {
      const queryVector = await embeddingService.embedText(context.query);
      const results = await vectorService.search(queryVector, {
        limit: context.limit ?? 5,
        customerId: context.customerId,
        documentType: context.documentType,
      });
      return {
        results: results.map((r) => ({
          text: r.text,
          score: r.score,
          source: r.metadata.source,
          documentType: r.metadata.documentType,
          customerId: r.metadata.customerId,
        })),
      };
    },
  });
}
