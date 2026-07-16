# `useQuery` & `useMutation` vs. raw fetch/axios

## Why use them instead of a plain `fetch`/`axios` call?

| Feature | Plain fetch/axios | TanStack Query (`useQuery`/`useMutation`) |
|---|---|---|
| Caching | None — every call hits the network | Results cached by `queryKey`, instant on repeat |
| Deduping | Duplicate requests fire independently | Simultaneous requests for the same key are merged into one |
| Loading/error state | Manual `useState` + `useEffect` boilerplate | `isLoading`, `isPending`, `isError`, `error` built in |
| Background refetch | Manual polling code | Auto-refetch on focus, reconnect, interval, or staleness |
| Retries | Manual | Automatic retry with backoff, configurable |
| Cache invalidation | Manual re-fetch calls scattered around | `queryClient.invalidateQueries()` — one call, all consumers refresh |
| Optimistic updates / rollback | Hand-rolled | First-class support (`onMutate`/`onError`/`onSettled`) |
| Request cancellation | Manual `AbortController` | Automatic on unmount / key change |
| Devtools | None | Visual cache/query inspector |

**Rule of thumb:** `useQuery` = automatic, for **reading** data. `useMutation` = manual/triggered, for **writing** data (POST/PUT/DELETE) or any side effect.

---

## `useQuery` — when is it called?

Runs **automatically**: on mount, and again whenever its `queryKey` changes, becomes stale, the window refocuses, or the network reconnects. You never call it directly — you declare *what* data you want and React Query decides *when* to fetch it.

### Example 1 — basic query
`frontend/src/pages/CustomersPage.tsx`
```tsx
const customersQuery = useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
```

### Example 2 — dependent query with `enabled`
Only fires once a customer is selected — the second query depends on the result of user interaction with the first.
`frontend/src/pages/CustomersPage.tsx`
```tsx
const meetingsQuery = useQuery({
  queryKey: ["meetings", selected],
  queryFn: () => api.listMeetingsForCustomer(selected!),
  enabled: !!selected, // don't fetch until `selected` is set
});
```

### Example 3 — rendering loading state
`frontend/src/pages/CustomersPage.tsx`
```tsx
{customersQuery.isLoading && <div className="text-sm text-slate-500">Loading&hellip;</div>}
```

---

## `useMutation` — when is it called?

Does **not** run automatically. It returns a `mutate()` (or `mutateAsync()`) function that you call imperatively — typically from a button `onClick` or form `onSubmit`. Used for writes/side-effects, and commonly paired with `queryClient.invalidateQueries()` on success so related `useQuery` calls refetch fresh data.

### Example 1 — mutation + cache invalidation
`frontend/src/pages/WorkflowsPage.tsx`
```tsx
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
```

### Example 2 — triggering it from a click handler
Note `.reset()` clears stale `.data`/`.error` from a previous call before firing a new one — otherwise a prior result briefly stays on screen.
`frontend/src/pages/WorkflowsPage.tsx`
```tsx
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
```

### Example 3 — mutation with `onSuccess`/`onError` updating local state
`frontend/src/pages/ChatPage.tsx`
```tsx
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
        text: `Error: ${error.message}`,
      },
    ]);
  },
});
```
