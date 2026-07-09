import {
  ChatResponse,
  Customer,
  DocumentRecord,
  ExecutiveBriefing,
  Meeting,
  RecommendedAction,
} from "../types";

/**
 * All requests go through the same-origin `/api` prefix. In docker-compose
 * nginx proxies that prefix to the backend container; in local dev, Vite's
 * dev server proxy (see vite.config.ts) does the same against
 * localhost:3000. Either way the frontend never needs to know the
 * backend's real address.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  chat: (message: string, conversationId?: string) =>
    request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify({ message, conversationId }) }),

  listCustomers: () => request<Customer[]>("/customers"),
  getCustomer: (customerId: string) => request<Customer>(`/customers/${customerId}`),

  listDocuments: () => request<DocumentRecord[]>("/documents"),
  uploadDocument: async (file: File, documentType: string, customerId?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("documentType", documentType);
    if (customerId) form.append("customerId", customerId);
    const res = await fetch("/api/documents/upload", { method: "POST", body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<{ documentId: string; chunksCreated: number }>;
  },

  listMeetings: () => request<Meeting[]>("/transcripts"),
  listMeetingsForCustomer: (customerId: string) => request<Meeting[]>(`/transcripts/customer/${customerId}`),
  analyzeMeeting: (meetingId: string) => request<{ meetingId: string; analysis: unknown; chunksIndexed: number }>(
    `/transcripts/${meetingId}/analyze`,
    { method: "POST" },
  ),

  generateExecutiveBriefing: (customerId: string) =>
    request<ExecutiveBriefing>(`/workflows/executive-briefing/${customerId}`, { method: "POST" }),
  listActions: () => request<RecommendedAction[]>("/workflows/actions"),
  decideAction: (actionId: string, decision: "approved" | "rejected") =>
    request<RecommendedAction>(`/workflows/actions/${actionId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};
