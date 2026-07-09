import { Controller, Get, Param, Post } from "@nestjs/common";
import { TranscriptionService } from "./transcription.service.js";

@Controller("api/transcripts")
export class TranscriptionController {
  constructor(private readonly transcriptionService: TranscriptionService) {}

  @Get()
  async listAll() {
    return this.transcriptionService.listAll();
  }

  @Get("customer/:customerId")
  async listForCustomer(@Param("customerId") customerId: string) {
    return this.transcriptionService.listForCustomer(customerId);
  }

  @Post(":meetingId/analyze")
  async analyze(@Param("meetingId") meetingId: string) {
    return this.transcriptionService.analyzeAndIndex(meetingId);
  }
}
