import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

/**
 * Drives the executive-briefing Mastra workflow and the human-approval
 * queue for recommended actions. This is the "Action Agent" surface: the
 * AI can only propose actions here, a human must explicitly approve or
 * reject them - nothing is executed automatically.
 */
export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState("");

  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
  const actionsQuery = useQuery({ queryKey: ["actions"], queryFn: api.listActions });

  const briefingMutation = useMutation({
    mutationFn: () => api.generateExecutiveBriefing(customerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["actions"] }),
  });

  const decisionMutation = useMutation({
    mutationFn: ({ actionId, decision }: { actionId: string; decision: "approved" | "rejected" }) =>
      api.decideAction(actionId, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["actions"] }),
  });

  const briefing = briefingMutation.data;

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto p-6">
      <h1 className="text-base font-semibold text-white">Executive Briefings &amp; Recommended Actions</h1>
      <p className="mb-6 text-xs text-slate-400">
        Runs the multi-step Executive Briefing Mastra workflow (CRM context via MCP &rarr; RAG knowledge search
        &rarr; LLM synthesis). Recommended actions require explicit human approval before anything downstream would
        act on them.
      </p>

      <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-4">
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">Select a customer&hellip;</option>
          {customersQuery.data?.map((c) => (
            <option key={c.customerId} value={c.customerId}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          disabled={!customerId || briefingMutation.isPending}
          onClick={() => {
            // useMutation keeps the previous result in `.data` until the
            // new call resolves - without this, a stale briefing (or
            // error) from a prior customer/attempt stays on screen
            // throughout the new generation and would look like it
            // belongs to the currently selected customer.
            briefingMutation.reset();
            briefingMutation.mutate();
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
        >
          {briefingMutation.isPending ? "Generating…" : "Generate briefing"}
        </button>
      </div>

      {briefingMutation.isError && (
        <div className="mb-4 text-xs text-red-400">{(briefingMutation.error as Error).message}</div>
      )}

      {briefing && (
        <div className="mb-8 rounded-lg border border-slate-800 bg-slate-950/40 p-5">
          <h2 className="text-lg font-semibold text-white">{briefing.customerName}</h2>
          <p className="mt-1 text-xs text-slate-500">Generated {new Date(briefing.generatedAt).toLocaleString()}</p>
          <p className="mt-3 text-sm text-slate-200">{briefing.executiveSummary}</p>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Key opportunities</h3>
              <ul className="flex flex-col gap-1 text-sm text-slate-300">
                {briefing.keyOpportunities.map((o, i) => (
                  <li key={i}>&bull; {o}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Key risks</h3>
              <ul className="flex flex-col gap-1 text-sm text-slate-300">
                {briefing.keyRisks.map((r, i) => (
                  <li key={i}>&bull; {r}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-white">Recommended actions</h2>
      <div className="flex flex-col gap-2">
        {actionsQuery.data?.length === 0 && (
          <div className="text-xs text-slate-500">No recommended actions yet. Generate a briefing to create some.</div>
        )}
        {actionsQuery.data?.map((action) => (
          <div key={action.actionId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-white">{action.action}</div>
                <div className="mt-1 text-xs text-slate-400">{action.rationale}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                  {action.customerId} &middot; {new Date(action.createdAt).toLocaleString()}
                </div>
              </div>
              {action.status === "pending_approval" ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => decisionMutation.mutate({ actionId: action.actionId, decision: "approved" })}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decisionMutation.mutate({ actionId: action.actionId, decision: "rejected" })}
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-red-400 hover:text-red-300"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <span
                  className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${
                    action.status === "approved" ? "bg-emerald-900 text-emerald-300" : "bg-red-900 text-red-300"
                  }`}
                >
                  {action.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
