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

  /** Nest injects `ConfigService`; the Qdrant client itself isn't built until `onModuleInit()`, since it needs config values resolved first. */
  constructor(private readonly config: ConfigService) {}

  /**
   * NestJS lifecycle hook, runs once at startup. Reads the Qdrant URL,
   * collection name, and vector dimensionality from config (the latter
   * must match whatever the embedding model actually produces - 384 for
   * `Xenova/all-MiniLM-L6-v2`, see `embedding.service.ts` - a mismatch here
   * would make every upsert/search fail), then makes sure the collection
   * exists before any other request tries to use it.
   */
  async onModuleInit() {
    this.client = new QdrantClient({ url: this.config.get<string>("qdrant.url")! });
    this.collection = this.config.get<string>("qdrant.collection")!;
    this.dimensions = this.config.get<number>("embedding.dimensions")!;
    await this.ensureCollection();
  }

  /**
   * Idempotent collection bootstrap: no-ops if the collection is already
   * there (e.g. on every restart after the first), otherwise creates it
   * with the configured vector size and Cosine distance. Cosine is the
   * standard choice for sentence-embedding similarity (it compares vector
   * *direction*, not magnitude, which is what these models are trained to
   * make meaningful).
   */
  private async ensureCollection(): Promise<void> {
    const exists = await this.client.collectionExists(this.collection);
    if (exists.exists) return;
    this.logger.log(`Creating Qdrant collection "${this.collection}"`);
    await this.client.createCollection(this.collection, {
      vectors: { size: this.dimensions, distance: "Cosine" },
    });
  }

  /**
   * Writes one Qdrant point per chunk: `chunks[i]` and `vectors[i]` must be
   * the same length and index-aligned (the caller - `DocumentService`/
   * `TranscriptionService` - is responsible for that pairing; this method
   * doesn't validate it). Each point's payload holds the chunk's raw
   * `text` alongside its metadata (`documentId`, `chunkIndex`, `source`,
   * `customerId`, `documentType`, ...) - storing the text directly in
   * Qdrant, not just a reference back to Mongo, is what lets `search()`
   * return quotable content with no second lookup (see Q12 in
   * `docs/Q & A.md`). `wait: true` blocks until Qdrant has actually
   * indexed the points rather than just accepting them, so a caller that
   * awaits this can immediately rely on the data being searchable.
   */
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

  /**
   * The only method the RAG tool (`rag.tool.ts`) actually calls. Runs a
   * cosine-similarity nearest-neighbor search against `queryVector` (the
   * caller has already embedded the user's query text with the same
   * model used at ingestion time - this method just does the vector math),
   * optionally narrowed with an exact-match payload filter on
   * `customerId`/`documentType` when the caller supplied either. Reshapes
   * Qdrant's raw point format into this app's `RagSearchResult` contract,
   * splitting the payload back into `text` plus everything else as
   * `metadata`.
   */
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

  /**
   * Removes every point tagged with a given `documentId` - all of that
   * document/transcript's chunks at once, regardless of `chunkIndex`.
   * Called before re-upserting (`DocumentService`/`TranscriptionService`'s
   * re-index paths) so re-ingesting the same document replaces its old
   * chunks instead of accumulating duplicates alongside them.
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [{ key: "documentId", match: { value: documentId } }] },
    });
  }
}
