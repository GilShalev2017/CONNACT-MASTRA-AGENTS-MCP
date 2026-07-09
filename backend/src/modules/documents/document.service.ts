import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { VectorService } from "../vector/vector.service.js";
import { EmbeddingService } from "../vector/embedding.service.js";
import { chunkText } from "../../common/chunking.js";
import { DocumentChunk } from "../../common/interfaces/rag.interfaces.js";
import { DocumentEntity, DocumentRecord } from "./schemas/document.schema.js";

export interface IngestDocumentInput {
  filename: string;
  buffer: Buffer;
  documentType: string;
  customerId?: string;
  source?: string;
}

/**
 * Owns the full RAG ingestion pipeline: text extraction -> chunking ->
 * embedding -> vector upsert -> metadata persistence. This is the module
 * a real system would extend with OCR, better chunking, or a queue for
 * large-file async processing; for the demo it runs synchronously per
 * upload, which is fine at this document volume.
 */
@Injectable()
export class DocumentService implements OnModuleInit {
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    @InjectModel(DocumentEntity.name) private readonly documentModel: Model<DocumentRecord>,
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ingestKnowledgeBaseIfEmpty();
  }

  /**
   * Seeds the "public knowledge" corpus (migration guides, architecture
   * recommendations, security/FinOps playbooks) on first boot so the RAG
   * tool has something grounded to retrieve from immediately, without a
   * manual upload step.
   */
  private async ingestKnowledgeBaseIfEmpty(): Promise<void> {
    const existing = await this.documentModel.countDocuments({ documentType: { $ne: "meeting-transcript" } });
    if (existing > 0) {
      this.logger.log(`Knowledge base already has ${existing} documents, skipping bootstrap ingestion`);
      return;
    }

    const dir = this.config.get<string>("knowledgeDocsPath")!;
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
    } catch {
      this.logger.warn(`Knowledge docs directory not found at ${dir}, skipping bootstrap ingestion`);
      return;
    }

    for (const file of files) {
      const fullPath = path.join(dir, file);
      const raw = await readFile(fullPath, "utf-8");
      const { documentType, source, body } = this.parseFrontmatter(raw);
      await this.ingestDocument({
        filename: file,
        buffer: Buffer.from(body, "utf-8"),
        documentType: documentType ?? "knowledge-guide",
        source: source ?? file,
      });
    }
    this.logger.log(`Bootstrap-ingested ${files.length} knowledge base documents`);
  }

  private parseFrontmatter(raw: string): { documentType?: string; source?: string; body: string } {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { body: raw };
    const [, frontmatter, body] = match;
    const documentType = frontmatter.match(/documentType:\s*"?([^"\n]+)"?/)?.[1]?.trim();
    const source = frontmatter.match(/source:\s*"?([^"\n]+)"?/)?.[1]?.trim();
    return { documentType, source, body };
  }

  async ingestDocument(input: IngestDocumentInput): Promise<{ documentId: string; chunksCreated: number }> {
    const documentId = randomUUID();
    const text = await this.extractText(input.filename, input.buffer);
    const chunks = chunkText(text);

    const createdAt = new Date().toISOString();
    const docChunks: DocumentChunk[] = chunks.map((chunkTextValue, index) => ({
      id: randomUUID(),
      text: chunkTextValue,
      metadata: {
        source: input.source ?? input.filename,
        customerId: input.customerId,
        documentType: input.documentType,
        documentId,
        chunkIndex: index,
        createdAt,
      },
    }));

    const vectors = await this.embeddingService.embedBatch(docChunks.map((c) => c.text));
    await this.vectorService.upsertChunks(docChunks, vectors);

    await this.documentModel.create({
      documentId,
      filename: input.filename,
      documentType: input.documentType,
      customerId: input.customerId,
      source: input.source ?? input.filename,
      chunkCount: docChunks.length,
      sizeBytes: input.buffer.byteLength,
    });

    this.logger.log(`Ingested "${input.filename}" as ${docChunks.length} chunks (documentId=${documentId})`);
    return { documentId, chunksCreated: docChunks.length };
  }

  private async extractText(filename: string, buffer: Buffer): Promise<string> {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const parsed = await pdfParse(buffer);
      return parsed.text;
    }
    // .txt, .md and anything else unrecognized is treated as plain text -
    // good enough for the document types this demo ingests.
    return buffer.toString("utf-8");
  }

  async listDocuments() {
    return this.documentModel.find().sort({ createdAt: -1 }).lean();
  }
}
