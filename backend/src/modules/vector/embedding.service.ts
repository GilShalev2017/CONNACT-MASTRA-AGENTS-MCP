import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Generates sentence embeddings locally using Transformers.js
 * (all-MiniLM-L6-v2, 384 dimensions) instead of calling an external
 * embeddings API. This is a deliberate simplification for the demo: it
 * means the RAG pipeline works fully offline with no embeddings API key,
 * at the cost of lower embedding quality than a large hosted model (e.g.
 * OpenAI text-embedding-3). In production you would likely swap this for
 * a hosted embeddings API or a dedicated embedding service sized for
 * throughput - the rest of the app only depends on `embedText`/
 * `embedBatch`, so that swap is contained entirely to this file.
 */
@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private extractor: any;
  private loadingPromise: Promise<void> | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    // Warm the model at startup rather than on first request, so the
    // first chat/document-upload call isn't penalized with model load time.
    await this.ensureLoaded();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.extractor) return;
    if (!this.loadingPromise) {
      this.loadingPromise = this.load();
    }
    await this.loadingPromise;
  }

  private async load(): Promise<void> {
    const modelName = this.config.get<string>("embedding.model")!;
    this.logger.log(`Loading local embedding model "${modelName}"...`);
    const { pipeline, env } = await import("@xenova/transformers");
    // Keep model files inside the container's writable cache dir.
    env.cacheDir = process.env.TRANSFORMERS_CACHE ?? "/tmp/transformers-cache";
    this.extractor = await pipeline("feature-extraction", modelName);
    this.logger.log("Embedding model loaded");
  }

  async embedText(text: string): Promise<number[]> {
    const [vector] = await this.embedBatch([text]);
    return vector;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.ensureLoaded();
    const results: number[][] = [];
    for (const text of texts) {
      const output = await this.extractor(text, { pooling: "mean", normalize: true });
      results.push(Array.from(output.data as Float32Array));
    }
    return results;
  }
}
