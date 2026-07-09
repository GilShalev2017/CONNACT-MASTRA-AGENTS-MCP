import { Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { randomUUID } from "node:crypto";
import { MeetingEntity, MeetingRecord } from "./schemas/meeting.schema.js";
import { VectorService } from "../vector/vector.service.js";
import { EmbeddingService } from "../vector/embedding.service.js";
import { MastraService } from "../agents/mastra.service.js";
import { chunkText } from "../../common/chunking.js";
import { DocumentChunk } from "../../common/interfaces/rag.interfaces.js";

/**
 * Media Intelligence Extension (simplified):
 *
 *   Video -> Speech-to-Text -> Transcript -> Chunking -> Embedding ->
 *   Vector DB -> AI Analysis
 *
 * This service picks up the pipeline at "Transcript" - real audio/video
 * ingestion and Speech-to-Text (e.g. Whisper) are out of scope for this
 * demo and would sit in front of `analyzeAndIndex()` in production,
 * turning a recording into the `transcript` string this method takes as
 * input. Everything from chunking onward (embedding, vector indexing, and
 * AI-driven summary/sentiment/action-item/risk extraction) is real and
 * runs end to end, which is the point being demonstrated: unstructured
 * business data becoming searchable, analyzed AI knowledge.
 */
@Injectable()
export class TranscriptionService implements OnModuleInit {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    @InjectModel(MeetingEntity.name) private readonly meetingModel: Model<MeetingRecord>,
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly mastraService: MastraService,
  ) {}

  /**
   * The crm-mcp-server container seeds the shared `meetings` collection
   * on its own startup, which can race with this container. Rather than
   * couple startup ordering tightly across services, poll briefly for
   * seed data to appear before giving up - a manual re-index is always
   * available via POST /api/transcripts/:meetingId/analyze afterward.
   */
  async onModuleInit() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const count = await this.meetingModel.countDocuments();
      if (count > 0) {
        await this.ensureAllIndexed();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    this.logger.warn("No meetings found after waiting for seed data; skipping transcript bootstrap indexing");
  }

  async listForCustomer(customerId: string) {
    return this.meetingModel.find({ customerId }).sort({ date: -1 }).lean();
  }

  async listAll() {
    return this.meetingModel.find().sort({ date: -1 }).lean();
  }

  /**
   * Re-runs AI analysis on a stored transcript and (re)indexes it into
   * the vector store so the RAG tool can retrieve it in future chat
   * questions. Idempotent: re-running replaces the previous chunks for
   * this meeting.
   */
  async analyzeAndIndex(meetingId: string) {
    const meeting = await this.meetingModel.findOne({ meetingId });
    if (!meeting) throw new NotFoundException(`Meeting "${meetingId}" not found`);

    const analysis = await this.mastraService.analyzeMeetingTranscript(
      meeting.transcript,
      `${meeting.title} (${meeting.date})`,
    );

    meeting.summary = analysis.summary;
    meeting.sentiment = analysis.sentiment;
    meeting.actionItems = analysis.actionItems;
    meeting.risks = analysis.risks;
    meeting.indexed = true;
    await meeting.save();

    const chunksIndexed = await this.indexTranscript(meeting);
    this.logger.log(`Analyzed and indexed meeting "${meetingId}" as ${chunksIndexed} chunks`);
    return { meetingId, analysis, chunksIndexed };
  }

  private async indexTranscript(meeting: MeetingRecord): Promise<number> {
    await this.vectorService.deleteByDocumentId(meeting.meetingId);
    const chunks = chunkText(meeting.transcript);
    const createdAt = new Date().toISOString();
    const docChunks: DocumentChunk[] = chunks.map((text, chunkIndex) => ({
      id: randomUUID(),
      text,
      metadata: {
        source: meeting.title,
        customerId: meeting.customerId,
        documentType: "meeting-transcript",
        documentId: meeting.meetingId,
        chunkIndex,
        createdAt,
      },
    }));
    const vectors = await this.embeddingService.embedBatch(docChunks.map((c) => c.text));
    await this.vectorService.upsertChunks(docChunks, vectors);
    return docChunks.length;
  }

  /**
   * Called once at startup: transcripts that already carry a seeded
   * summary (our synthetic demo meetings) are indexed directly without
   * spending an LLM call re-deriving analysis that's already known-good;
   * anything without a summary goes through full AI analysis first.
   */
  async ensureAllIndexed() {
    const meetings = await this.meetingModel.find({ indexed: { $ne: true } });
    for (const meeting of meetings) {
      try {
        if (meeting.summary) {
          await this.indexTranscript(meeting);
          meeting.indexed = true;
          await meeting.save();
        } else {
          await this.analyzeAndIndex(meeting.meetingId);
        }
      } catch (err) {
        this.logger.error(`Failed to index meeting ${meeting.meetingId}: ${(err as Error).message}`);
      }
    }
  }
}
