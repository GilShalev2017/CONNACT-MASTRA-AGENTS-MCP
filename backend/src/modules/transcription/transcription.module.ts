import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TranscriptionService } from "./transcription.service.js";
import { TranscriptionController } from "./transcription.controller.js";
import { MeetingEntity, MeetingSchema } from "./schemas/meeting.schema.js";
import { VectorModule } from "../vector/vector.module.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MeetingEntity.name, schema: MeetingSchema }]),
    VectorModule,
    AgentsModule,
  ],
  controllers: [TranscriptionController],
  providers: [TranscriptionService],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
