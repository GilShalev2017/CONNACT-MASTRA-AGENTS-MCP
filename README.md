# ConnAct — AI Cloud Partnership Intelligence Platform

A working demonstration of an enterprise AI system: a Mastra-based agent that answers
questions about customer cloud partnerships by combining **RAG** (semantic search over
internal knowledge) with **MCP** (typed access to a simulated CRM), fronted by a NestJS
API and a React chat interface.

This is not a chatbot demo. It's an architecture demo — the point is to show how the
pieces (agents, tools, RAG, MCP, vector DB, workflows, backend/frontend separation) fit
together the way they would in a real enterprise AI platform, at a scale you can actually
read end to end.

See also: [`docs/architecture.puml`](docs/architecture.puml) ·
[`docs/sequence.puml`](docs/sequence.puml) ·
[`docs/rag-flow.puml`](docs/rag-flow.puml) ·
[`docs/mcp-flow.puml`](docs/mcp-flow.puml) ·
[`LEARNING.md`](LEARNING.md) · [`PROJECT_TOUR.md`](PROJECT_TOUR.md)

## What's here

| Piece | Tech | Role |
|---|---|---|
| `frontend/` | React + TypeScript + Tailwind + React Query | Chat UI, document upload, agent activity view, customer browser, executive briefings |
| `backend/` | NestJS + TypeScript | REST API, RAG pipeline, Mastra agent orchestration, MCP client |
| `mcp-server/` | Node + `@modelcontextprotocol/sdk` + MongoDB | Standalone MCP server simulating a CRM integration |
| `data/` | JSON + Markdown | Synthetic customers/meetings + a small "public knowledge" corpus (migration/architecture/security/FinOps guides) |
| `docs/` | PlantUML + Markdown | Architecture diagrams and learning material |

Backend AI stack: **Mastra** (agents, tools, workflows), **Qdrant** (vector DB),
**Xenova/Transformers.js** (local embeddings, no API key needed), **Anthropic Claude**
(via the Vercel AI SDK) for generation.

## Quick start

```bash
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY - required for the agent to generate answers
docker compose up --build
```

Then open:

- **App**: http://localhost:5173
- **Backend API**: http://localhost:3000/api
- **CRM MCP server**: http://localhost:4100/mcp (health check: http://localhost:4100/health)
- **Qdrant dashboard**: http://localhost:6333/dashboard

Without `ANTHROPIC_API_KEY` set, everything **except** the AI agent still works: customer
browsing, document upload/ingestion, and RAG indexing all run with no LLM involved. Chat,
meeting analysis, and executive briefings will return a clear
`503 "set ANTHROPIC_API_KEY..."` response instead of a raw stack trace until you add a key.

This has been built and run end-to-end via `docker compose up --build` as part of
developing it — all five containers (MongoDB, Qdrant, crm-mcp-server, backend, frontend)
start healthy, the knowledge base auto-ingests on backend boot, and every REST endpoint
below was exercised live.

## Example questions to try

- "Which customers are good candidates for Azure migration?"
- "What technical blockers were mentioned by Acme Manufacturing?"
- "Summarize the latest discussion with Northwind Retail Group."
- "Which customers have cloud optimization opportunities?"
- "What's driving Summit Logistics' urgency to move off GCP?"
- "Prepare an executive briefing for HelioCare Health Systems." (via the Briefings & Actions page)

## Project layout

```
backend/src/modules/
  agents/         Mastra agents, tools, and the /api/chat controller
  documents/       Upload -> extract -> chunk -> embed -> index pipeline
  vector/          Qdrant + local embedding services (the RAG storage layer)
  mcp/             MCP client that talks to crm-mcp-server
  customers/       Read-only CRM browsing for the frontend (not used by the agent)
  transcription/   Meeting transcript indexing + AI analysis (Media Intelligence Extension)
  workflows/       Executive Briefing Mastra workflow + human-approval action queue
  common/          Shared interfaces, chunking helper, LLM provider factory

mcp-server/src/    Standalone CRM MCP server (tools + MongoDB access)
frontend/src/      React app: chat, documents, customers, briefings/actions pages
data/              Synthetic seed data (customers, meetings) + knowledge base markdown
```

## What was simplified (and how it would extend in production)

This is documented in more detail in [`LEARNING.md`](LEARNING.md#production-considerations),
but the short version:

- **Embeddings run locally** (Xenova/Transformers.js, all-MiniLM-L6-v2, 384-dim) instead of
  calling a hosted embeddings API, so the RAG pipeline works with zero external
  dependencies beyond the LLM itself. Swapping to a hosted embeddings API is contained to
  `backend/src/modules/vector/embedding.service.ts`.
- **Chunking is a fixed-size sliding window** (~180 words, 30-word overlap), not
  semantic/heading-aware chunking. Good enough at this corpus size; a production system
  ingesting large heterogeneous documents would want smarter splitting.
- **The MCP server simulates a CRM** by reading/writing MongoDB instead of calling
  Salesforce/HubSpot/an internal API. The point being demonstrated is the *boundary*
  (agent talks MCP, never touches the database) — swapping the implementation behind
  that boundary doesn't require changing the agent.
- **Speech-to-text is out of scope.** The "Media Intelligence Extension" (transcription
  module) picks up the pipeline at "already have a transcript" rather than processing
  audio/video — see `backend/src/modules/transcription/transcription.service.ts` for
  exactly where a real STT step (e.g. Whisper) would plug in.
- **The action-approval queue is in-memory**, not persisted. It demonstrates the
  human-in-the-loop gate (the AI can propose actions, never execute them) without a full
  workflow/task persistence layer.
- **No auth.** There's no user/session model — every request is treated as an
  authenticated internal user. See `LEARNING.md` for what a production auth/permissions
  layer would need to add.

## Development (without Docker)

Each service can run locally against the dockerized infra (Mongo/Qdrant/MCP server) or
fully locally:

```bash
# infra only
docker compose up mongodb qdrant crm-mcp-server

# backend (in backend/)
npm install
MONGO_URL=mongodb://localhost:27017/connact \
QDRANT_URL=http://localhost:6333 \
CRM_MCP_SERVER_URL=http://localhost:4100/mcp \
ANTHROPIC_API_KEY=sk-... \
npx tsc -p tsconfig.json && node dist/main.js

# frontend (in frontend/)
npm install
npm run dev   # proxies /api to http://localhost:3000, see vite.config.ts
```
