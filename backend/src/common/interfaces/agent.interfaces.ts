import { RagSearchResult } from "./rag.interfaces.js";

/**
 * The "Agent Activity View" in the frontend is driven entirely by this
 * shape. It intentionally exposes only *technical execution events*
 * (which tool ran, with what arguments, what it returned) - never the raw
 * model chain-of-thought - matching the product requirement to show
 * agent activity without exposing private reasoning.
 */
export interface AgentToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
  durationMs: number;
}

export interface AgentStep {
  label: string;
  detail: string;
}

export interface ChatResponse {
  conversationId: string;
  answer: string;
  agentName?: string;
  sources: RagSearchResult[];
  toolCalls: AgentToolCallTrace[];
  steps: AgentStep[];
}
