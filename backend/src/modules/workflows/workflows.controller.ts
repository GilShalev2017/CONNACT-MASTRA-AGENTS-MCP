import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { WorkflowsService } from "./workflows.service.js";

@Controller("api/workflows")
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post("executive-briefing/:customerId")
  async executiveBriefing(@Param("customerId") customerId: string) {
    return this.workflowsService.generateExecutiveBriefing(customerId);
  }

  @Get("actions")
  async listActions() {
    return this.workflowsService.listActions();
  }

  @Get("briefings")
  async listBriefings() {
    return this.workflowsService.listBriefings();
  }

  @Post("actions/:actionId/decision")
  async decideAction(@Param("actionId") actionId: string, @Body("decision") decision: string) {
    if (decision !== "approved" && decision !== "rejected") {
      throw new BadRequestException("decision must be 'approved' or 'rejected'");
    }
    return this.workflowsService.decideAction(actionId, decision);
  }
}
