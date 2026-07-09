import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function CustomersPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const customersQuery = useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
  const meetingsQuery = useQuery({
    queryKey: ["meetings", selected],
    queryFn: () => api.listMeetingsForCustomer(selected!),
    enabled: !!selected,
  });

  const selectedCustomer = customersQuery.data?.find((c) => c.customerId === selected);

  return (
    <div className="flex h-full">
      <div className="w-96 shrink-0 overflow-y-auto border-r border-slate-800 p-4">
        <h1 className="mb-1 text-base font-semibold text-white">Customers</h1>
        <p className="mb-4 text-xs text-slate-400">CRM data surfaced via the customers module (read-only UI view).</p>
        {customersQuery.isLoading && <div className="text-sm text-slate-500">Loading&hellip;</div>}
        <div className="flex flex-col gap-2">
          {customersQuery.data?.map((c) => (
            <button
              key={c.customerId}
              onClick={() => setSelected(c.customerId)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selected === c.customerId
                  ? "border-brand-500 bg-brand-600/10"
                  : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
              }`}
            >
              <div className="text-sm font-medium text-white">{c.name}</div>
              <div className="text-xs text-slate-400">
                {c.industry} &middot; {c.currentCloud} &middot; ${c.monthlySpendUsd?.toLocaleString()}/mo
              </div>
              {c.tags && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.tags.map((t) => (
                    <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!selectedCustomer && <div className="text-sm text-slate-500">Select a customer to view details.</div>}
        {selectedCustomer && (
          <div className="max-w-3xl">
            <h2 className="text-xl font-semibold text-white">{selectedCustomer.name}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {selectedCustomer.industry} &middot; {selectedCustomer.region} &middot; Account owner:{" "}
              {selectedCustomer.accountOwner}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Current cloud" value={selectedCustomer.currentCloud ?? "—"} />
              <Stat label="Monthly spend" value={`$${selectedCustomer.monthlySpendUsd?.toLocaleString()}`} />
              <Stat label="Health score" value={String(selectedCustomer.healthScore ?? "—")} />
            </div>

            <Section title="Challenges" items={selectedCustomer.challenges} />
            <Section title="Opportunities" items={selectedCustomer.opportunities} />

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-white">Meeting history</h3>
              {meetingsQuery.isLoading && <div className="text-xs text-slate-500">Loading&hellip;</div>}
              <div className="flex flex-col gap-3">
                {meetingsQuery.data?.map((m) => (
                  <div key={m.meetingId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white">{m.title}</div>
                      <div className="text-xs text-slate-500">{m.date}</div>
                    </div>
                    {m.sentiment && (
                      <div className="mt-1 inline-block rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                        {m.sentiment}
                      </div>
                    )}
                    {m.summary && <p className="mt-2 text-xs text-slate-400">{m.summary}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function Section({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-300">
            <span className="text-brand-400">&bull;</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
