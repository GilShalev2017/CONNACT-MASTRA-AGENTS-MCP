import { Module } from "@nestjs/common";
import { MastraService } from "./mastra.service.js";
import { AgentsController } from "./agents.controller.js";
import { VectorModule } from "../vector/vector.module.js";
import { McpModule } from "../mcp/mcp.module.js";

/**
 * The AI core of the platform. Depends on VectorModule (for the RAG tool)
 * and McpModule (for the CRM tools) but is deliberately the *only* module
 * that constructs Mastra agents - other modules that need an LLM call
 * (transcription, workflows) import this module and go through
 * MastraService rather than building their own Agent instances.
 */
@Module({
  imports: [VectorModule, McpModule],
  controllers: [AgentsController],
  providers: [MastraService],
  exports: [MastraService],
})
export class AgentsModule {}
