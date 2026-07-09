import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Workflow } from "@mastra/core/workflows";
import { McpClientService } from "../mcp/mcp-client.service.js";
import { VectorService } from "../vector/vector.service.js";
import { EmbeddingService } from "../vector/embedding.service.js";
import { MastraService } from "../agents/mastra.service.js";
import { buildExecutiveBriefingWorkflow, executiveBriefingOutputSchema } from "./executive-briefing.workflow.js";
import { z } from "zod";

export type ExecutiveBriefing = z.infer<typeof executiveBriefingOutputSchema>;

export interface RecommendedAction {
  actionId: string;
  customerId: string;
  action: string;
  rationale: string;
  status: "pending_approval" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
}

/**
 * Runs the executive-briefing Mastra workflow and turns its output's
 * `recommendedActions` into tracked, human-approvable action records.
 * This is the "Action Agent" requirement from the spec implemented as a
 * lightweight in-memory approval queue: the AI is only ever allowed to
 * *propose* actions here, never execute them. A production version would
 * back this with a persistent store and real downstream integrations
 * (e.g. creating a CRM task) gated behind the same approval step.
 */
@Injectable()
export class WorkflowsService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowsService.name);
  private workflow!: Workflow<any, any, any, any, any, any>;
  private readonly pendingActions = new Map<string, RecommendedAction>();

  constructor(
    private readonly mcpClient: McpClientService,
    private readonly vectorService: VectorService,
    private readonly embeddingService: EmbeddingService,
    private readonly mastraService: MastraService,
  ) {}

  onModuleInit() {
    this.workflow = buildExecutiveBriefingWorkflow({
      mcpClient: this.mcpClient,
      vectorService: this.vectorService,
      embeddingService: this.embeddingService,
      briefingAgent: this.mastraService.getExecutiveBriefingAgent(),
    });
  }

  async generateExecutiveBriefing(customerId: string): Promise<ExecutiveBriefing> {
    const run = this.workflow.createRun();
    const result = await run.start({ inputData: { customerId } });

    if (result.status !== "success") {
      throw new Error(`Executive briefing workflow did not complete successfully (status=${result.status})`);
    }

    const briefing = result.result as ExecutiveBriefing;
    for (const recommended of briefing.recommendedActions) {
      const actionId = randomUUID();
      this.pendingActions.set(actionId, {
        actionId,
        customerId,
        action: recommended.action,
        rationale: recommended.rationale,
        status: "pending_approval",
        createdAt: new Date().toISOString(),
      });
    }
    return briefing;
  }

  listActions(): RecommendedAction[] {
    return Array.from(this.pendingActions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  decideAction(actionId: string, decision: "approved" | "rejected"): RecommendedAction {
    const action = this.pendingActions.get(actionId);
    if (!action) throw new Error(`Action "${actionId}" not found`);
    action.status = decision;
    action.decidedAt = new Date().toISOString();
    this.logger.log(`Action ${actionId} (${action.action}) marked as ${decision} by a human reviewer`);
    return action;
  }
}
