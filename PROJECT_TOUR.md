# PROJECT_TOUR.md — A Guided Walkthrough

This follows one request end to end: a user asks *"Which customers are good candidates
for Azure migration?"* in the chat UI. Read alongside `docs/sequence.puml`.

## 1. React sends the request

`frontend/src/pages/ChatPage.tsx` holds the conversation in local state and a React
Query `useMutation` that calls `api.chat(message, conversationId)`
(`frontend/src/api/client.ts`), a `fetch("/api/chat", { method: "POST", body: {message, conversationId} })`.
In docker-compose, nginx (`frontend/nginx.conf`) proxies `/api/*` straight to the backend
container — the browser never needs to know the backend's real address.

## 2. NestJS API receives it

`backend/src/modules/agents/agents.controller.ts` — `AgentsController.chat()` — is the
only route mapped to `POST /api/chat`. It validates the body against `ChatRequestDto`
(`backend/src/modules/agents/dto/chat.dto.ts`) and hands off immediately to
`MastraService.chat()`. The controller itself contains no AI logic; it's a thin adapter
between HTTP and the agent layer.

## 3. Mastra Agent invocation

`backend/src/modules/agents/mastra.service.ts` — `MastraService` is built once at
NestJS startup (`onModuleInit`): it constructs the language model (Claude, via
`backend/src/common/llm.ts`), builds the RAG tool and five CRM tools, and constructs
`CloudPartnershipAgent` as a Mastra `Agent` with those tools attached
(`agent.config.ts` holds its instructions/guardrails). `chat()` calls
`this.cloudPartnershipAgent.generate(message, { maxSteps: 5 })` — this is the single line
that hands control to the LLM's agentic loop.

## 4. Tool selection

Mastra's `Agent.generate()` sends the user's message plus every registered tool's
name/description/schema to Claude. The model decides which tool(s) it needs based purely
on those descriptions — nothing in NestJS routes the question to a specific tool. For
this question, the model will typically call `getMigrationOpportunities`
(`backend/src/modules/agents/tools/crm.tools.ts`) since it's described as "Use for 'which
customers should we prioritize' questions," and may also call `searchKnowledgeBase`
(`backend/src/modules/agents/tools/rag.tool.ts`) if it wants migration-prioritization
guidance from the knowledge base.

## 5. RAG retrieval

If `searchKnowledgeBase` is called: `backend/src/modules/agents/tools/rag.tool.ts` calls
`EmbeddingService.embedText()` (`backend/src/modules/vector/embedding.service.ts`,
running the local Xenova model) to turn the query into a 384-dim vector, then
`VectorService.search()` (`backend/src/modules/vector/vector.service.ts`) runs a cosine
similarity search against Qdrant and returns ranked chunks with their source metadata.
These chunks were put there earlier by `DocumentService`
(`backend/src/modules/documents/document.service.ts`), which ingests the knowledge base
markdown files from `data/knowledge-docs/` automatically on first backend boot.

## 6. MCP calls

If `getMigrationOpportunities` is called: the tool in `crm.tools.ts` calls
`McpClientService.callTool("getMigrationOpportunities", {})`
(`backend/src/modules/mcp/mcp-client.service.ts`). This service holds a connected MCP
`Client` (from `@modelcontextprotocol/sdk`) talking over `StreamableHTTPClientTransport`
to the standalone `crm-mcp-server` process. That server
(`mcp-server/src/server.ts` + `mcp-server/src/tools.ts`) receives the MCP JSON-RPC call,
runs the real MongoDB query (customers tagged `migration-candidate` or `at-risk`, sorted
by spend), and returns the result as MCP tool output. The backend never queries MongoDB
for this data itself — see `docs/mcp-flow.puml` for the full round trip.

## 7. Agent combines information and the LLM generates the final answer

Mastra appends both tool results back into the conversation and calls the LLM again;
Claude synthesizes a final answer text grounded in whatever the tools returned. This can
repeat (up to `maxSteps: 5`) if the model decides it needs another tool call before it can
answer confidently.

## 8. Response shaping and the final UI response

Back in `MastraService.chat()`, the raw Vercel AI SDK result (`GenerateTextResult`, with
`.text`, `.toolCalls`, `.toolResults`) is reshaped into the `ChatResponse` contract
(`backend/src/common/interfaces/agent.interfaces.ts`): `answer`, `sources` (extracted from
any `searchKnowledgeBase` tool result), `toolCalls` (a factual trace of every tool call
and a one-line summary of what it returned), and `steps` (a synthesized high-level
narrative — "Understood question" → one step per tool call → "Synthesized answer" — built
from the actual tool-call record, never from the model's hidden reasoning tokens).

`AgentsController` returns this as the HTTP response. `ChatPage.tsx` appends the answer
to the conversation and stores the full `ChatResponse` on that message; clicking
"View agent activity" swaps `AgentActivityPanel`
(`frontend/src/components/AgentActivityPanel.tsx`) to render that message's `steps`,
`toolCalls`, and `sources` — the Agent Activity View is rendering exactly the payload
the backend assembled in step 8, no separate request needed.

## Other paths worth knowing about

- **Document upload**: `DocumentsPage.tsx` → `DocumentController.upload()` →
  `DocumentService.ingestDocument()` runs the same extract/chunk/embed/index pipeline
  described in step 5, on demand.
- **Meeting analysis**: `TranscriptionService.analyzeAndIndex()`
  (`backend/src/modules/transcription/transcription.service.ts`) runs a dedicated
  `MeetingAnalysisAgent` over a transcript to extract summary/sentiment/action
  items/risks, then indexes the transcript into Qdrant so future chat questions can
  retrieve it — this is the "Media Intelligence Extension" from the spec, picked up at
  the transcript stage (see `LEARNING.md` for what's simplified).
- **Executive briefings**: `WorkflowsPage.tsx` → `WorkflowsController` →
  `WorkflowsService.generateExecutiveBriefing()` runs an actual Mastra `Workflow`
  (`backend/src/modules/workflows/executive-briefing.workflow.ts`) — three explicit,
  typed steps (gather CRM context → gather knowledge context → synthesize) rather than a
  single ad-hoc agent call, and turns the workflow's `recommendedActions` into
  human-approvable records that only change state when a person clicks Approve/Reject.
