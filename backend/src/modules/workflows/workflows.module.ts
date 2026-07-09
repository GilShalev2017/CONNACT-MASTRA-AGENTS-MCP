import { Module } from "@nestjs/common";
import { WorkflowsService } from "./workflows.service.js";
import { WorkflowsController } from "./workflows.controller.js";
import { McpModule } from "../mcp/mcp.module.js";
import { VectorModule } from "../vector/vector.module.js";
import { AgentsModule } from "../agents/agents.module.js";

@Module({
  imports: [McpModule, VectorModule, AgentsModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}
