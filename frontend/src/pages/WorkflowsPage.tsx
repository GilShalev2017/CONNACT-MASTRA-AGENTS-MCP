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
  // Backend keeps the latest generated briefing per customer (see
  // WorkflowsService.briefingsByCustomer) so past briefings can be
  // revisited here, not just the one from the current browser session.
  const briefingsQuery = useQuery({ queryKey: ["briefings"], queryFn: api.listBriefings });

  const briefingMutation = useMutation({
    mutationFn: () => api.generateExecutiveBriefing(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      queryClient.invalidateQueries({ queryKey: ["briefings"] });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: ({ actionId, decision }: { actionId: string; decision: "approved" | "rejected" }) =>
      api.decideAction(actionId, decision),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["actions"] }),
  });

  const customerNameById = new Map(customersQuery.data?.map((c) => [c.customerId, c.name]));
  const briefingByCustomerId = new Map(briefingsQuery.data?.map((b) => [b.customerId, b]));

  // actionsQuery.data arrives most-recent-first (backend sorts by
  // createdAt desc); grouping with a Map preserves that order, so the
  // customer with the most recently generated action still ends up as
  // the first card.
  const actionsByCustomer = new Map<string, NonNullable<typeof actionsQuery.data>>();
  for (const action of actionsQuery.data ?? []) {
    const existing = actionsByCustomer.get(action.customerId);
    if (existing) existing.push(action);
    else actionsByCustomer.set(action.customerId, [action]);
  }

  // Union of customers that have actions and/or a briefing - a briefing
  // whose LLM run produced zero recommendedActions (the degraded
  // "incomplete" fallback, see docs/Q & A.md) would otherwise have no
  // card at all despite genuinely having briefing content to show.
  // actions-having customers keep their existing recency order; any
  // briefing-only customer is appended after.
  const cardCustomerIds = Array.from(new Set([...actionsByCustomer.keys(), ...briefingByCustomerId.keys()]));

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

      {briefingMutation.isPending && (
        <div className="mb-6 rounded-lg border border-brand-500/40 bg-brand-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-200">
            <svg className="h-4 w-4 animate-spin text-brand-300" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Generating executive briefing for {customerNameById.get(customerId) ?? "customer"}&hellip;
          </div>
          <p className="mt-1 text-xs text-brand-300/80">
            Gathering CRM context, searching the knowledge base, and synthesizing with the LLM - this can take up to
            20 seconds.
          </p>
          <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-brand-900/60">
            <div className="animate-indeterminate absolute inset-y-0 rounded-full bg-brand-400" />
          </div>
        </div>
      )}

      {briefingMutation.isError && (
        <div className="mb-4 text-xs text-red-400">{(briefingMutation.error as Error).message}</div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-white">Briefings &amp; recommended actions</h2>
      <div className="flex flex-col gap-4">
        {cardCustomerIds.length === 0 && (
          <div className="text-xs text-slate-500">No briefings yet. Generate one to get started.</div>
        )}
        {cardCustomerIds.map((groupCustomerId) => {
          const groupBriefing = briefingByCustomerId.get(groupCustomerId);
          const actions = actionsByCustomer.get(groupCustomerId) ?? [];
          return (
          <div key={groupCustomerId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">
              {customerNameById.get(groupCustomerId) ?? groupCustomerId}
            </h3>

            {groupBriefing && (
              <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-[11px] text-slate-500">
                  Briefing generated {new Date(groupBriefing.generatedAt).toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-slate-200">{groupBriefing.executiveSummary}</p>

                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      Key opportunities
                    </h4>
                    <ul className="flex flex-col gap-1 text-xs text-slate-300">
                      {groupBriefing.keyOpportunities.map((o, i) => (
                        <li key={i}>&bull; {o}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Key risks</h4>
                    <ul className="flex flex-col gap-1 text-xs text-slate-300">
                      {groupBriefing.keyRisks.map((r, i) => (
                        <li key={i}>&bull; {r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {actions.map((action) => (
                <div key={action.actionId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-white">{action.action}</div>
                      <div className="mt-1 text-xs text-slate-400">{action.rationale}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                        {new Date(action.createdAt).toLocaleString()}
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
        })}
      </div>
    </div>
  );
}
