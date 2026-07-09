import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document as MongooseDocument } from "mongoose";

export type MeetingRecord = MeetingEntity & MongooseDocument;

/**
 * Mirrors the `meetings` collection seeded by crm-mcp-server. The
 * "transcript" field here plays the role that a real system would fill
 * via a Speech-to-Text pipeline (e.g. Whisper) run over a call recording -
 * see transcription.service.ts for where that pipeline would plug in.
 */
@Schema({ collection: "meetings" })
export class MeetingEntity {
  @Prop({ required: true, unique: true })
  meetingId!: string;

  @Prop({ required: true })
  customerId!: string;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  date!: string;

  @Prop([String])
  attendees?: string[];

  @Prop({ required: true })
  transcript!: string;

  @Prop()
  summary?: string;

  @Prop()
  sentiment?: string;

  @Prop([String])
  actionItems?: string[];

  @Prop([String])
  risks?: string[];

  @Prop({ default: false })
  indexed?: boolean;
}

export const MeetingSchema = SchemaFactory.createForClass(MeetingEntity);
