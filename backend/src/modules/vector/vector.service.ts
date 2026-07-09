import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { QdrantClient } from "@qdrant/js-client-rest";
import { DocumentChunk, DocumentChunkMetadata, RagSearchResult } from "../../common/interfaces/rag.interfaces.js";

/**
 * Owns all interaction with the Qdrant vector database. Nothing outside
 * this module (and embedding.service.ts) knows Qdrant exists - the agent's
 * RAG tool only calls `search()` and gets back plain `RagSearchResult[]`.
 * That isolation is what lets the vector store be swapped (e.g. for
 * pgvector or Pinecone in production) without touching agent or document
 * ingestion code.
 */
@Injectable()
export class VectorService implements OnModuleInit {
  private readonly logger = new Logger(VectorService.name);
  private client!: QdrantClient;
  private collection!: string;
  private dimensions!: number;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = new QdrantClient({ url: this.config.get<string>("qdrant.url")! });
    this.collection = this.config.get<string>("qdrant.collection")!;
    this.dimensions = this.config.get<number>("embedding.dimensions")!;
    await this.ensureCollection();
  }

  private async ensureCollection(): Promise<void> {
    const exists = await this.client.collectionExists(this.collection);
    if (exists.exists) return;
    this.logger.log(`Creating Qdrant collection "${this.collection}"`);
    await this.client.createCollection(this.collection, {
      vectors: { size: this.dimensions, distance: "Cosine" },
    });
  }

  async upsertChunks(chunks: DocumentChunk[], vectors: number[][]): Promise<void> {
    if (chunks.length === 0) return;
    await this.client.upsert(this.collection, {
      wait: true,
      points: chunks.map((chunk, i) => ({
        id: chunk.id,
        vector: vectors[i],
        payload: { text: chunk.text, ...chunk.metadata } as Record<string, unknown>,
      })),
    });
  }

  async search(
    queryVector: number[],
    options: { limit?: number; customerId?: string; documentType?: string } = {},
  ): Promise<RagSearchResult[]> {
    const must: Record<string, unknown>[] = [];
    if (options.customerId) must.push({ key: "customerId", match: { value: options.customerId } });
    if (options.documentType) must.push({ key: "documentType", match: { value: options.documentType } });

    const result = await this.client.search(this.collection, {
      vector: queryVector,
      limit: options.limit ?? 5,
      filter: must.length ? { must } : undefined,
      with_payload: true,
    });

    return result.map((point) => {
      const payload = (point.payload ?? {}) as Record<string, unknown> & { text: string };
      const { text, ...metadata } = payload;
      return {
        id: String(point.id),
        text: text ?? "",
        score: point.score,
        metadata: metadata as unknown as DocumentChunkMetadata,
      };
    });
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: documentId } }] },
    });
  }
}
