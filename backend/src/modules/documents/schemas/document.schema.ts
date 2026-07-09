import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document as MongooseDocument } from "mongoose";

export type DocumentRecord = DocumentEntity & MongooseDocument;

/**
 * Metadata-only record of an ingested document. The actual searchable
 * content lives in Qdrant as chunk embeddings - Mongo here just tracks
 * "what documents exist" for the document library UI and audit purposes,
 * mirroring how a real system separates operational metadata from the
 * vector index.
 */
@Schema({ timestamps: true })
export class DocumentEntity {
  @Prop({ required: true, unique: true })
  documentId!: string;

  @Prop({ required: true })
  filename!: string;

  @Prop({ required: true })
  documentType!: string;

  @Prop()
  customerId?: string;

  @Prop({ required: true })
  source!: string;

  @Prop({ required: true })
  chunkCount!: number;

  @Prop()
  sizeBytes?: number;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentEntity);
