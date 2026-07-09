import { Body, Controller, Post } from "@nestjs/common";
import { MastraService } from "./mastra.service.js";
import { ChatRequestDto } from "./dto/chat.dto.js";
import { ChatResponse } from "../../common/interfaces/agent.interfaces.js";

/**
 * The single entry point the React chat interface calls. One request in,
 * one response out - the response bundles the answer together with the
 * RAG sources and MCP tool calls used to produce it, so the frontend can
 * render the "Agent Activity View" from the same payload without extra
 * round trips.
 */
@Controller("api/chat")
export class AgentsController {
  constructor(private readonly mastraService: MastraService) {}

  @Post()
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponse> {
    return this.mastraService.chat(body.message, body.conversationId);
  }
}
