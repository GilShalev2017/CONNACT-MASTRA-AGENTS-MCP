import { Module } from "@nestjs/common";
import { VectorService } from "./vector.service.js";
import { EmbeddingService } from "./embedding.service.js";

/**
 * Encapsulates the entire RAG storage layer (embeddings + vector search).
 * Exported services are consumed by the documents module (ingestion) and
 * the agents module (retrieval tool) - both depend on this module rather
 * than on Qdrant/Xenova directly.
 */
@Module({
  providers: [VectorService, EmbeddingService],
  exports: [VectorService, EmbeddingService],
})
export class VectorModule {}
