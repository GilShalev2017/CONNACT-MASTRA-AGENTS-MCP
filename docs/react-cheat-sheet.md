---
title: "React Cheat Sheet — CONNACT-MASTRA-AGENTS-MCP Frontend"
---

# React Cheat Sheet

Grounded in the actual `frontend/` codebase — every example is real, with file references.

---

## 1. Why native `fetch` instead of axios?

This app deliberately uses the browser's built-in `fetch`, wrapped in one small generic helper, rather than pulling in axios. It's a legitimate design choice for *this* app's shape — not a universal rule.

### What axios adds over native `fetch`

| Feature | axios | native `fetch` |
|---|---|---|
| Auto JSON parse/stringify | Yes | Manual (`.json()`, `JSON.stringify()`) |
| Rejects on non-2xx status | Yes (throws automatically) | **No** — only rejects on network failure; a 404/500 still *resolves* successfully, you must check `res.ok` yourself |
| Request/response interceptors | Yes — global auth-header injection, 401→refresh→retry | None built in |
| `timeout` option | Yes | Manual, via `AbortController` |
| Upload/download progress events | Yes | Manual, via `ReadableStream` |
| Bundle cost | ~13–17 kB gzipped, extra dependency to patch/update | Zero — built into every modern browser/runtime |

### What this project actually uses, in 12 lines

```ts
// frontend/src/api/client.ts
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
```
This reimplements exactly the two things axios would've given for free — non-2xx → throw, and JSON parsing — and nothing more.

### Why the rest of axios's feature set isn't needed here

- **No auth at all exists in this backend** (no guards, no middleware, confirmed by grep) → nothing to centralize via interceptors.
- **No token-refresh flow** → no 401→retry logic to write.
- **React Query already owns** retries, caching, loading/error state, and request de-duplication — the layer axios interceptors usually sit *underneath*.
- **No upload-progress UI** — `uploadDocument` just awaits a plain `fetch(..., { body: formData })`.

### When axios (or a fetch wrapper like `ky`/`ofetch`) *would* earn its keep

- Multiple auth flows, or a centralized 401 → refresh-token → retry-original-request pattern
- Many call sites needing request cancellation
- Upload/download progress bars
- A team convention that already standardizes on axios elsewhere

**Verdict:** not "axios is better" or "fetch is better" in the abstract — it's "does this app's complexity justify the dependency." Right now, no. If auth gets added, that's the natural point to revisit: either adopt axios for its interceptors, or keep extending this same `request()` helper (attach an `Authorization` header, catch 401 centrally) — both valid, and the helper approach stays dependency-free as long as it stays simple.

---

## 2. `useQuery` and `useMutation` — every usage, every setting

The app has exactly **6 `useQuery` call sites** (4 distinct cache entries) and **4 `useMutation` call sites**. Every one is listed below — nothing omitted, nothing hypothetical.

### 2A. Every `useQuery` call site

| Component | `queryKey` | `queryFn` | `enabled`? | Why |
|---|---|---|---|---|
| `DocumentsPage.tsx:20` | `["documents"]` | `api.listDocuments` | — (always on) | Populates the ingested-documents list |
| `DocumentsPage.tsx:21` | `["customers"]` | `api.listCustomers` | — (always on) | Populates the "associated customer" `<select>` |
| `CustomersPage.tsx:8` | `["customers"]` | `api.listCustomers` | — (always on) | Populates the customer list sidebar |
| `CustomersPage.tsx:9-13` | `["meetings", selected]` | `() => api.listMeetingsForCustomer(selected!)` | `!!selected` | Only fetch meeting history once a customer is actually clicked |
| `WorkflowsPage.tsx:15` | `["customers"]` | `api.listCustomers` | — (always on) | Populates the briefing-generation customer `<select>` |
| `WorkflowsPage.tsx:16` | `["actions"]` | `api.listActions` | — (always on) | Populates the recommended-actions approval queue |

**Notice `["customers"]` appears 3 times, in 3 unrelated components, with zero coordination between them.** That's not 3 separate network calls in practice — React Query keys its cache by `queryKey`, so all three components read/share **one** cached result. No prop drilling, no Context needed — this is React Query acting as the app's de facto global server-state store (see §3's custom-hooks discussion below for what *is* still worth extracting here).

### 2B. `useQuery` settings — what each one means

| Setting | Used here? | Purpose |
|---|---|---|
| `queryKey` | Every call | Uniquely identifies this data in the cache. Same key anywhere in the app = same cached data, shared and de-duped automatically. Array form lets you parametrize it — `["meetings", selected]` creates a **separate cache entry per customer**, so switching customers doesn't show stale data from the last one. |
| `queryFn` | Every call | The actual async function that fetches the data. Whatever it returns becomes `.data`. |
| `enabled` | Only `meetingsQuery` | Gates whether the query runs *at all*. `enabled: !!selected` means: don't even attempt the fetch (don't hit a `/customer/undefined` URL) until a customer is selected. Without this, the query would fire immediately on mount with a bad argument. |
| *(global, not per-call)* `retry: 1` | Set once in `main.tsx`'s `QueryClient` | Applies to **every** `useQuery` in the app: on failure, retry once before surfacing an error, instead of React Query's default of 3 retries with exponential backoff. |
| *(global, not per-call)* `refetchOnWindowFocus: false` | Set once in `main.tsx`'s `QueryClient` | Applies to every query: normally React Query silently refetches when the browser tab regains focus; this app opts out of that everywhere. |
| `staleTime` | **Not used anywhere** | Not set per-call or globally → defaults to `0`, meaning every mount/remount is considered instantly stale and eligible for a background refetch. |
| `select` / `initialData` / `refetchInterval` | **Not used anywhere** | No client-side data transforms, no SSR-style hydration, no polling in this app. |

### 2C. Every `useMutation` call site

| Component | `mutationFn` does | `onSuccess` | `onError` |
|---|---|---|---|
| `ChatPage.tsx:22-42` | `api.chat(message, conversationId.current)` | Updates `conversationId.current` (ref), appends the assistant's reply to local `messages` state, sets `activeResponse` for the side panel | Appends a "something went wrong" message to `messages` |
| `DocumentsPage.tsx:23-29` | `api.uploadDocument(file, documentType, customerId)` | `queryClient.invalidateQueries({ queryKey: ["documents"] })` + clears the file `<input>` via ref | *(none — falls through to `.isError`/`.error` read directly in JSX instead)* |
| `WorkflowsPage.tsx:18-21` | `api.generateExecutiveBriefing(customerId)` | `queryClient.invalidateQueries({ queryKey: ["actions"] })` | *(none — same pattern, `.isError` read in JSX)* |
| `WorkflowsPage.tsx:23-27` | `api.decideAction(actionId, decision)` | `queryClient.invalidateQueries({ queryKey: ["actions"] })` | *(none)* |

Notice **two different error-handling styles** coexist: `ChatPage` handles errors *inside* the mutation config (`onError`) to push a chat bubble; the other three just read `mutation.isError` / `mutation.error` directly in JSX and render inline. Both are valid React Query patterns — which one fits depends on whether the error needs to become part of some other piece of state (like the chat transcript) or can just be rendered where the trigger button lives.

### 2D. `useMutation` settings — what each one means

| Setting | Used here? | Purpose |
|---|---|---|
| `mutationFn` | Every call | The async function that performs the write. Unlike `queryFn`, it's **not automatically called** — you trigger it yourself via `.mutate(arg)` or `.mutateAsync(arg)`. |
| `onSuccess` | All 4 calls | Runs after `mutationFn` resolves. The universal use here is `queryClient.invalidateQueries({ queryKey: [...] })` — telling React Query "the cached list this mutation affects is now stale, go refetch it." This is how the UI stays in sync after a write, without any mutation manually pushing new data into another query's cache. |
| `onError` | Only `ChatPage`'s `mutation` | Runs if `mutationFn` throws. Used here to convert a network error into a normal chat message rather than an uncaught rejection. |
| `mutationKey`, `onSettled`, `retry` | **Not used anywhere** | No cross-component mutation tracking, no "runs whether success or failure" cleanup, and mutations use the client's default retry behavior. |

### 2E. Returned state fields consumed in JSX

| Field | Used on | Meaning |
|---|---|---|
| `.data` | both `useQuery` and `useMutation` | The resolved value. For queries: the last successful fetch result (persists across background refetches). For mutations: the result of the *last* `mutate()` call only. |
| `.isLoading` | `useQuery` only (`customersQuery.isLoading`, `meetingsQuery.isLoading`) | True only while a query has **no cached data yet** and is fetching — i.e. the true "first load" spinner state. |
| `.isPending` | `useMutation` only (`uploadMutation.isPending`, `mutation.isPending`, `briefingMutation.isPending`) | True while the mutation's async function is in flight. |
| `.isSuccess` / `.isError` | both | Straightforward status flags for conditional rendering. |
| `.error` | both, where read | The thrown error/rejection value — cast to `Error` in JSX (`(mutation.error as Error).message`) since TanStack Query types it as `unknown` by default. |

**Worth knowing:** in TanStack Query v4, `isLoading` was used for both queries *and* mutations. **v5** (what this app uses — `^5.62.11`) split the terminology: `isPending` is now the general "in flight" flag on both, while `isLoading` on queries specifically means *"pending AND has no data yet"* (a derived/compound state, useful for distinguishing "first load" from "background refetch while showing stale data"). This app's code already reflects that v5 convention correctly — queries use `.isLoading`, mutations use `.isPending`.

---

## 3. When are custom hooks useful? What does React itself say?

**This app currently has zero custom hooks** (confirmed by grep — no files starting with `use*`) — every `useQuery`/`useMutation` call lives directly inside its page component. That's a reasonable choice at this size, but it's worth knowing the actual guidance, because there's at least one place in this exact codebase where it's starting to strain (see below).

### The mechanism (there's no special API)

A custom hook is just a plain JavaScript function whose name starts with `use` and which calls other hooks inside it. That's the entire contract — no registration, no special syntax. The `use` prefix exists purely so:
- **The linter** (`eslint-plugin-react-hooks`) can recognize it and enforce the Rules of Hooks on it (only call at the top level, only from components or other hooks — not inside loops/conditionals/plain functions).
- **Other developers** know it's allowed to internally hold state or subscribe to something, unlike a normal helper function.

### What React's own docs (react.dev) actually say

1. **Custom hooks share *logic*, not *state*.** Each component that calls the same custom hook gets its own, fully independent state — a custom hook is not a way to share a value between components (that's what lifting state up or Context is for). It's a way to avoid re-writing the same *stateful pattern* repeatedly.
2. **Extract one when the same combination of built-in hooks (`useState` + `useEffect`, or here, a `useQuery` shape) shows up in more than a couple of places**, and giving it a name would make the calling component's intent clearer — e.g. `useOnlineStatus()` reads better at the call site than the raw subscription logic inline.
3. **Not every duplication needs extracting.** React's guidance explicitly says a little duplication is fine — don't force an abstraction just because two components look similar; extract when the logic represents one clear *concept* worth naming, not merely to shorten files.
4. Custom hooks can take any arguments and return anything (object, array, single value, nothing) — there's no fixed shape, unlike, say, a reducer.

### Where this project's own code fits that guidance

The `["customers"]` query (§2A) is called identically in **three separate components** — `DocumentsPage`, `CustomersPage`, and `WorkflowsPage` — each writing out `useQuery({ queryKey: ["customers"], queryFn: api.listCustomers })` verbatim. This is close to the textbook case React's docs describe: the same hook combination, repeated 3+ times, that would read more clearly as a named concept:

```ts
// hypothetical: frontend/src/hooks/useCustomers.ts
export function useCustomers() {
  return useQuery({ queryKey: ["customers"], queryFn: api.listCustomers });
}
```
Each call site becomes `const customersQuery = useCustomers();` — same shared cache behavior as today (the `queryKey` is unchanged), just with the intent named once instead of repeated three times.

The two `["actions"]`-invalidating mutations in `WorkflowsPage` (§2C) are a weaker case for extraction — they're both in the *same* component already, so there's no cross-component duplication to eliminate, just two related pieces of logic sitting next to each other. Per React's own "don't force it" guidance, that one's fine left as-is.
