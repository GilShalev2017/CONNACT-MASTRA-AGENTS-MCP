import { ChatResponse } from "../types";

/**
 * Renders the "Agent Activity View": which RAG search ran, which MCP/CRM
 * tools were called with what arguments, and a high-level step trace.
 * Everything shown here comes straight from the backend's tool-call
 * record - never the model's private chain-of-thought - matching the
 * product requirement to expose execution, not reasoning.
 */
export default function AgentActivityPanel({ response }: { response: ChatResponse | null }) {
  if (!response) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
        Ask a question to see which tools the agent uses and what knowledge it retrieves.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <section>
        <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active agent</div>
          <div className="mt-1 text-sm font-medium text-slate-100">{response.agentName ?? "CloudPartnershipAgent"}</div>
        </div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Reasoning steps</h3>
        <ol className="flex flex-col gap-2">
          {response.steps.map((step, i) => (
            <li key={i} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div className="text-sm font-medium text-slate-100">{step.label}</div>
              <div className="mt-1 text-xs text-slate-400">{step.detail}</div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Tools executed ({response.toolCalls.length})
        </h3>
        {response.toolCalls.length === 0 ? (
          <div className="text-xs text-slate-500">No tools were called for this response.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {response.toolCalls.map((call, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-brand-300">{call.tool}</span>
                </div>
                <div className="mt-1 truncate text-xs text-slate-500">
                  {JSON.stringify(call.args)}
                </div>
                <div className="mt-1 text-xs text-slate-300">{call.resultSummary}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          RAG sources ({response.sources.length})
        </h3>
        {response.sources.length === 0 ? (
          <div className="text-xs text-slate-500">No knowledge base search was used for this response.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {response.sources.map((source) => (
              <div key={source.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{source.metadata.source}</span>
                  <span className="text-slate-500">{(source.score * 100).toFixed(0)}% match</span>
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                  {source.metadata.documentType}
                  {source.metadata.customerId ? ` · ${source.metadata.customerId}` : ""}
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-slate-400">{source.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
