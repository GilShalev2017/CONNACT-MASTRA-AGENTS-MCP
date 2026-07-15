# Q & A — Short Version

Condensed version of [`Q & A.md`](Q%20&%20A.md) — same 18 questions, answers trimmed to the essentials. See the full doc for code excerpts, tables of evidence, and line-level references.

---

## 1. DTO validation — when, by whom, what happens on failure?
NestJS's global `ValidationPipe` (`main.ts`) runs `class-validator`/`class-transformer` on every `@Body()`-typed DTO. Only `ChatRequestDto` (`chat.dto.ts`) actually has validators (`@IsString()`, `@MinLength(1)`) — no other controller has DTO validation at all. On failure: throws `BadRequestException` (HTTP 400) *before* the route handler runs; the global `LlmErrorFilter` passes `HttpException`s through unchanged.

## 2. Mastra tool `description` — who uses it?
It's just a stored property with no logic of its own. Mastra converts it (via the Vercel AI SDK → `@ai-sdk/anthropic`) into the `tools[].description` field sent in Claude's actual API request — the **LLM** reads it to decide which tool to call and how. Never shown in the UI; `AgentActivityPanel` only renders tool name/args/result, not the static description.

## 3. Are DTOs/types shared between frontend and backend?
No — no workspace, no shared package. `frontend/src/types.ts` hand-duplicates backend response shapes (`ChatResponse`, `ExecutiveBriefing`, `RecommendedAction`, etc.), sometimes under different names (`RagSource` vs. `RagSearchResult`). Kept in sync by hand; nothing catches drift at build time.

## 4. What does `stripTemperature` do?
Wraps the Anthropic model in a `Proxy` that forces `temperature: undefined` on `doGenerate`/`doStream`. Needed because the pinned `ai` v4 SDK always defaults `temperature: 0` with no way to omit it, and Claude Sonnet 5 rejects any explicit `temperature` outright — every `agent.generate()` call was failing with 500. Side effect: temperature can no longer be pinned low, so structured-output calls run at Claude's (higher) default temperature.

## 5. What does "temperature" mean? Is it a confidence dial?
It's a sampling-time knob on the model's next-token probability distribution — low temperature (→0) picks the most likely token almost every time (deterministic, repeatable); high temperature flattens the distribution (more varied, more drift-prone). **It is not a confidence/certainty measure** — a confidently wrong answer at temperature 0 is wrong the same way every time. This app can't choose it at all today (Q4 strips it entirely).

## 6. Does chat have memory between turns?
No. `conversationId` is generated/echoed by `MastraService.chat()` but never used to look anything up; `agent.generate()` only ever receives the current message, no history. The UI's thread view is client-side only — `api.chat()` sends just `{ message, conversationId }`. To add real continuity: persist turns in Mongo keyed by `conversationId` (small, dependency-free), or wire up Mastra's built-in `Memory` feature (bigger but more "correct" — `@mastra/memory` isn't installed and no agent passes a `memory` option today).

## 7. `model` is a local variable in `onModuleInit()` — leak?
Not a closure — Mastra's `Agent` constructor copies the reference into its own `this.model`, so it stays reachable via `MastraService` (a singleton) → its 4 `Agent` fields → `.model`, for the app's whole lifetime. One shared model instance across all 4 agents, not four. Not a leak: created once at startup, never reallocated per-request.

## 8. What changes for a real production/SaaS deployment?
**Security**: zero auth anywhere (confirmed by grep — no Guards/JWT/passport), MCP server also wide open, secrets in plaintext `.env`, no rate limiting, RAG/CRM content is trusted input (prompt-injection surface). **Testing**: zero tests, zero CI. **Reliability**: no retries/circuit breakers, no correlation IDs, no metrics/tracing wired up. **Scaling**: `WorkflowsService.pendingActions` is an in-memory `Map` — breaks under multiple replicas; chat memory needs the same fix; embedding model loads in-process per replica; single Mongo/Qdrant containers, no prompt caching. **Multi-tenancy**: no `tenantId` anywhere in any schema. **DevOps**: Dockerfiles exist but no CI/CD. Priority order: auth → fix the in-memory queue → tests → observability.

## 9. Is the MCP server actually discoverable?
MCP's own discovery mechanism (`tools/list`) is implemented correctly server-side — any generic MCP client could discover all 5 tools today with zero prior integration. But this app's own agent doesn't use that: `McpClientService.listTools()` exists but is **never called**; `crm.tools.ts` hand-duplicates the same tool descriptions instead, risking drift. Small fix: build the Mastra tool map dynamically from `listTools()` at startup. Real-world discoverability also needs: a stable public URL (not `localhost`), OAuth 2.1 auth, MCP tool annotations, a published manifest, and schema versioning.

## 10. Agent tools (Mastra) vs. MCP tools — what's the difference?
Mastra tool = in-process, LLM-facing (what Claude's API actually sees in `tools[]`). MCP tool = out-of-process, protocol-facing, callable by any MCP client in any language. For the 5 CRM tools: Mastra wrapper (`crm.tools.ts`) → `McpClientService.callTool()` → real MCP call over HTTP → `crm-mcp-server` → Mongo. `searchKnowledgeBase` has no MCP hop at all — straight to Qdrant. Proven not 1:1: two places (`mastra.service.ts`'s history fast-path, the executive-briefing workflow step) call `mcpClient.callTool()` directly, bypassing any Mastra tool or LLM decision. The extra MCP hop buys decoupling — the CRM backend can be swapped/reused/scaled independently.

## 11. Which modules embed text?
Both `DocumentService` and `TranscriptionService` — two entry points into the same shared pipeline (`chunkText` → `embedBatch` → `upsertChunks`), feeding one Qdrant collection. Confirmed live: 22 points split across 6 `documentType`s (`meeting-transcript`, `finops-guide`, etc.) — only the `documentType`/`customerId` payload fields distinguish them.

## 12. When does semantic search run? Round trip to Mongo? Why overlap?
One call per `searchKnowledgeBase` invocation: embed the query, then `vectorService.search()`. **No Mongo round trip** — the chunk's actual text is stored directly in the Qdrant point's payload, so results are immediately quotable. Chunking is a fixed 180-word sliding window; a document becomes several separate Qdrant points sharing one `documentId`, each holding only its own slice, not the whole text. The 30-word overlap exists so a sentence straddling a chunk boundary appears complete in at least one neighboring chunk instead of truncated in both.

## 13. Does the Qdrant dashboard show real, learnable data?
Yes — verified live (22 real points, real customer/meeting text, reachable at `:6333/dashboard`). Honest caveat: with only 22 points, the 2D cluster-visualization tab won't show much; it's most useful here for manually inspecting real chunk boundaries and overlap, not for big-data exploration.

## 14. What does `indexTranscript()` actually do?
"Index" here means making the transcript semantically searchable (a vector index), not a MongoDB index. Steps: delete any existing Qdrant chunks for this `meetingId` (idempotent re-run) → `chunkText()` the transcript → embed each chunk → `upsertChunks()` into Qdrant. Called from `analyzeAndIndex()` (runs fresh LLM analysis first) and `ensureAllIndexed()` (startup fast path for pre-summarized seed data that skips the LLM call).

## 15. What types of "agent" exist in this codebase?
**(1) Plain tool-less agents** (`historySummarizerAgent`, `meetingAnalysisAgent`, `executiveBriefingAgent`) — pure prompt-in/text-or-object-out, no autonomy, can't fetch their own data. **(2) `cloudPartnershipAgent`** — the only tool-using agent; the model itself drives a multi-step tool-calling loop (`maxSteps`). **(3) The executive-briefing `Workflow`** — code (not the LLM) fixes the step order via `createStep`/`createWorkflow().then().then().commit()`; an agent is invoked inside just one step with zero say over the pipeline. `createStep` defines one typed pipeline stage; `.then()` wires each step's output schema to the next step's input schema; `.commit()` finalizes it for `createRun()`/`start()`.

## 16. What's the purpose of input/output schemas, and what is Zod?
Zod gives one schema declaration both a runtime validator (`.parse`/`.safeParse`) and a derived TS type (`z.infer`) — no hand-duplicated interfaces. The same `z.object({...})` syntax plays three different roles here: **tool `inputSchema`** (what the LLM must supply to call a tool), **workflow step schemas** (data contract between pipeline stages, enforced at runtime), and **structured `output` schema** (coerces/validates the model's final answer into JSON — the exact mechanism behind Q4/Q5's schema-compliance bug). Different boundary than `class-validator` (Q1): that's the HTTP request boundary, Zod is the LLM/pipeline boundary.

## 17. Mastra API reference — how do you invoke agents/workflows, and what do they return?

| API | Returns |
| --- | --- |
| `new Agent({...})` | An `Agent` instance (no LLM call yet) |
| `agent.generate(messages, options?)` | `Promise<GenerateReturn>` — `GenerateTextResult` (`.text`, `.toolCalls`, `.steps`) if no `output` schema, else `GenerateObjectResult` (`.object`) |
| `createTool({...})` | A `Tool` instance, only ever handed into an `Agent`'s `tools` map |
| `createStep({...})` | A `Step` instance (one pipeline stage) |
| `createWorkflow({...}).then().commit()` | A `Workflow` instance |
| `workflow.createRun()` | A `Run` instance — synchronous, nothing executed yet |
| `run.start({inputData})` | `Promise<WorkflowResult>` — discriminated union: `{status:'success', result, steps}` \| `{status:'failed', error}` \| `{status:'suspended'}` |
| `new Mastra({agents})` | A `Mastra` registry instance — built in this app but never actually read again (agents are invoked directly, not via the registry) |

`mcpClient.callTool()` is **not** a Mastra API — it's this app's own wrapper around the MCP SDK (see Q18).

## 18. MCP SDK API reference — the actual client/server calls used

**Client side** (`McpClientService`, talks to `crm-mcp-server`):

| API | Returns |
| --- | --- |
| `new Client({...})` / `new StreamableHTTPClientTransport(url)` | Client / transport instances, no network call yet |
| `client.connect(transport)` | `Promise<void>` — performs the handshake |
| `client.listTools()` | `Promise<{tools: [...]}>` — the protocol's discovery call (each tool includes an `annotations` field for `readOnlyHint`/etc., unused by `crm-mcp-server` today) |
| `client.callTool(params)` | `Promise<{content: [...]}>` — mixed-type array; this app only reads the first `text` part and `JSON.parse`s it |
| `client.close()` | `Promise<void>` |

**Server side** (`crm-mcp-server`):

| API | Returns |
| --- | --- |
| `new McpServer({...})` | Built **per HTTP request** here (stateless design), not once at startup |
| `server.registerTool(name, config, callback)` | A `RegisteredTool` (sync) — also what makes the tool show up in `tools/list` |
| `server.connect(transport)` / `new StreamableHTTPServerTransport()` / `transport.handleRequest(req, res)` | `Promise<void>` each — the transport writes the HTTP response directly |
| `server.close()` / `transport.close()` | `Promise<void>` — torn down per-request, paired with construction above |

## 19. Backend vs. `mcp-server` MongoDB access — Mongoose vs. native driver, and why

| Backend (`@nestjs/mongoose`) | `mcp-server` (native `mongodb` driver) |
| --- | --- |
| Full ODM: `@Schema`/`@Prop` classes → typed `Model<T>` | Raw driver: `db.collection(name)`, no schema layer at all |
| Schema enforces `required`/types — but only on writes made *through* Mongoose | No schema anywhere; reads/writes are loosely `any`-typed |
| Connection managed by `MongooseModule` (DI-provided, pooled) | Hand-rolled singleton `MongoClient` in `db.ts` |
| Query style: chainable builder (`.find().sort().lean()`) | Raw Mongo query documents (`.find({...}, {projection})`) |
| Why: larger NestJS app — Mongoose is the framework-idiomatic, DI-friendly Mongo integration | Why: small single-purpose microservice (CRUD + seed) — a full ODM would be overkill |
| Result: compile-time type safety on `customers`/`meetings` fields | Result: minimal dependencies, simplest possible fit for a narrow scope |

Both write into the *same* physical `customers`/`meetings` collections (mcp-server seeds them; backend's `TranscriptionService` also mutates `meetings` via Mongoose) — two independently-maintained schema definitions of one shared contract, no shared source of truth.

## 20. Do Qdrant points store text and metadata at the same level? Does cosine similarity use the text?
Yes — `payload: { text, ...metadata }` in `upsertChunks()` is flat, one object, no nesting. But cosine similarity is computed on the separate `vector` field (the 384-number embedding), not on `text` or `payload` at all — `payload` is just metadata returned alongside a match, not used in the similarity math. Payload only matters for optional exact-match filtering (`customerId`/`documentType`), a separate mechanism from ranking.

## 21. What does `score` mean in a search result?
Cosine similarity between the query's embedding and that point's stored embedding — roughly 0 to 1, higher means more semantically similar. It reflects closeness in *meaning* per the embedding model, not factual correctness — a high score means "this chunk is about something similar to the question," not "this chunk correctly answers it."
