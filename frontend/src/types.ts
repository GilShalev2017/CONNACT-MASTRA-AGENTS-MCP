export interface RagSource {
  id: string;
  text: string;
  score: number;
  metadata: {
    source: string;
    customerId?: string;
    documentType: string;
    documentId: string;
    chunkIndex: number;
    createdAt: string;
  };
}

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
  sources: RagSource[];
  toolCalls: AgentToolCallTrace[];
  steps: AgentStep[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  response?: ChatResponse;
}

export interface Customer {
  customerId: string;
  name: string;
  industry?: string;
  region?: string;
  currentCloud?: string;
  monthlySpendUsd?: number;
  migrationInterest?: string;
  accountOwner?: string;
  healthScore?: number;
  challenges?: string[];
  opportunities?: string[];
  tags?: string[];
}

export interface DocumentRecord {
  documentId: string;
  filename: string;
  documentType: string;
  customerId?: string;
  source: string;
  chunkCount: number;
  sizeBytes?: number;
  createdAt: string;
}

export interface Meeting {
  meetingId: string;
  customerId: string;
  title: string;
  date: string;
  attendees?: string[];
  transcript: string;
  summary?: string;
  sentiment?: string;
  actionItems?: string[];
  risks?: string[];
}

export interface ExecutiveBriefing {
  customerId: string;
  customerName: string;
  generatedAt: string;
  executiveSummary: string;
  keyOpportunities: string[];
  keyRisks: string[];
  recommendedActions: { action: string; rationale: string }[];
}

export interface RecommendedAction {
  actionId: string;
  customerId: string;
  action: string;
  rationale: string;
  status: "pending_approval" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
}
