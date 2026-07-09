import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client";
import { ChatMessage, ChatResponse } from "../types";
import ChatMessageBubble from "../components/ChatMessageBubble";
import AgentActivityPanel from "../components/AgentActivityPanel";

const EXAMPLE_QUESTIONS = [
  "Which customers are good candidates for Azure migration?",
  "What technical blockers were mentioned by Acme Manufacturing?",
  "Summarize the latest discussion with Northwind Retail Group.",
  "Which customers have cloud optimization opportunities?",
  "What's driving Summit Logistics' urgency to move off GCP?",
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeResponse, setActiveResponse] = useState<ChatResponse | null>(null);
  const conversationId = useRef<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (message: string) => api.chat(message, conversationId.current),
    onSuccess: (response) => {
      conversationId.current = response.conversationId;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: response.answer, response },
      ]);
      setActiveResponse(response);
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Something went wrong talking to the agent: ${error.message}`,
        },
      ]);
    },
  });

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text: trimmed }]);
    setInput("");
    mutation.mutate(trimmed);
  }

  return (
    <div className="flex h-full">
      <div className="flex h-full flex-1 flex-col">
        <header className="border-b border-slate-800 px-6 py-4">
          <h1 className="text-base font-semibold text-white">CloudPartnershipAgent</h1>
          <p className="text-xs text-slate-400">
            Ask about customers, cloud migration opportunities, or partnership context. Answers are grounded in the
            RAG knowledge base and live CRM data via MCP.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <div className="mb-6">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Try asking</div>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-brand-400 hover:text-brand-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <ChatMessageBubble key={m.id} message={m} onViewActivity={() => setActiveResponse(m.response ?? null)} />
            ))}
            {mutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
                  Thinking&hellip; retrieving knowledge and calling CRM tools
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          className="flex items-center gap-2 border-t border-slate-800 px-6 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a customer, migration opportunity, or partnership question..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>

      <div className="w-96 shrink-0 border-l border-slate-800 bg-slate-950/30">
        <div className="border-b border-slate-800 px-4 py-4">
          <h2 className="text-sm font-semibold text-white">Agent Activity View</h2>
          <p className="text-xs text-slate-500">Technical execution trace, not model reasoning</p>
        </div>
        <div className="h-[calc(100%-65px)]">
          <AgentActivityPanel response={activeResponse} />
        </div>
      </div>
    </div>
  );
}
