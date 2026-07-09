# LEARNING.md — AI Concepts and Architecture Decisions

This document explains the *why* behind ConnAct, aimed at someone comfortable with
software engineering but newer to how production AI systems are actually put together.

## AI Concepts

### What is an Agent?

An agent is an LLM given three things a plain chatbot doesn't have: **instructions**
(a system prompt defining its role and guardrails), **tools** (typed functions it can
choose to call), and a **loop** (it can call a tool, look at the result, and decide to
call another tool or another one before answering). The "agentic" part is the LLM
deciding *which* tools to call and in what order, based on the user's question — not a
human wiring up an if/else chain.

In this project, `CloudPartnershipAgent` (`backend/src/modules/agents/mastra.service.ts`)
is given six tools (one RAG search tool, five CRM tools) and decides per-question whether
it needs knowledge-base context, live CRM data, both, or neither. Ask it "what is FinOps?"
and it'll likely just search the knowledge base. Ask it "which customers should we
prioritize?" and it'll call `getMigrationOpportunities` without touching RAG at all. Ask
it "what's Acme's situation and what does our playbook say about it?" and it calls both.

### What is RAG?

RAG (Retrieval-Augmented Generation) is the pattern of retrieving relevant text from a
knowledge store *before* the LLM generates an answer, and feeding that text into the
prompt as context. It exists because LLMs don't know your private data (customer
records, internal playbooks, meeting notes) and can't be trusted to recall facts
precisely from training data even when they overlap. RAG turns "the model might know
something like this" into "the model is looking at this specific paragraph and is asked
to answer from it."

The pipeline (see `docs/rag-flow.puml`): document → extract text → chunk into overlapping
windows → embed each chunk into a vector → store in a vector database with metadata →
at query time, embed the question the same way → find the closest chunks by vector
similarity → hand those chunks to the LLM as grounding context.

### What are embeddings?

An embedding is a fixed-length vector of numbers (384 of them here) that represents the
*meaning* of a piece of text, produced by a model trained so that semantically similar
text produces vectors that are close together (measured by cosine similarity). "Azure
migration challenges" and "blockers moving to the cloud" end up near each other in vector
space even though they share almost no words — which is exactly what makes semantic
search more useful than keyword search for this kind of question.

This project uses a small local model (`Xenova/all-MiniLM-L6-v2`, via Transformers.js)
that runs in the Node process with no external API call — see
`backend/src/modules/vector/embedding.service.ts`. It's lower quality than a large hosted
embeddings model, but it means the whole RAG pipeline works with zero embeddings API cost
or key, which matters a lot for a project meant to run with `docker compose up`.

### Why use a Vector DB?

A vector database (Qdrant here) is built to do one thing efficiently at scale: given a
query vector, find the *k* nearest vectors out of millions, fast, with metadata filtering
(e.g. "only this customer's documents"). You could brute-force cosine similarity in
application code for a few hundred chunks, but that stops working long before you reach
real document volumes. Qdrant also stores the payload (chunk text + metadata) alongside
the vector, so a single query returns both.

### What is MCP?

MCP (Model Context Protocol) is a standard protocol for exposing tools/capabilities to an
LLM agent over a well-defined interface (JSON-RPC over HTTP or stdio), independent of
which agent framework or LLM is calling it. A server declares tools with a name,
description, and typed input schema; a client discovers and calls them. It's the same
idea as an API contract, but specifically designed for LLM tool-calling: descriptions are
written for the model to read, and the protocol handles discovery (`listTools`) so the
agent doesn't need hardcoded knowledge of what's available.

In this project, `mcp-server/` is a standalone process exposing five CRM tools
(`getCustomer`, `getCustomerHistory`, `getMigrationOpportunities`,
`getCustomerCloudUsage`, `listCustomers`). The NestJS backend's `McpClientService`
connects to it as an MCP client over Streamable HTTP; the agent's tools
(`backend/src/modules/agents/tools/crm.tools.ts`) are thin wrappers that call
`McpClientService.callTool(...)`. See `docs/mcp-flow.puml`.

### Why use MCP instead of direct integrations?

Two reasons, both about the *boundary* it creates:

1. **Decoupling the agent from the business system's implementation.** The agent's tool
   contract (`getCustomer(customerId)` returns this shape) doesn't change whether it's
   backed by MongoDB (as it is here), Salesforce, or an internal API. In this repo,
   swapping the CRM's real backend only touches `mcp-server/src/tools.ts` — nothing in
   `backend/` or the agent's prompt needs to know.
2. **A uniform, inspectable capability surface.** Because MCP tools are declared with
   schemas and descriptions, they're self-documenting to both the model and to a human
   reading `mcp-server/src/server.ts`. Multiple different agents (or different LLM
   providers entirely) can reuse the same MCP server without bespoke integration code
   per agent.

The tradeoff: it's an extra network hop and an extra process to run and monitor compared
to calling a function directly. For a single in-process tool that's overhead you don't
need; the value shows up once multiple systems/agents need the same capability, or once
the "business system" is something you don't want the AI process to have direct
credentials to.

## Architecture

### Why React/NestJS separation

Keeping the frontend and backend as separate deployable units means the AI orchestration
logic (agent, tools, RAG, MCP client) lives entirely server-side — the browser never
holds an LLM API key, never talks to Qdrant or MongoDB directly, and the "Agent Activity
View" is just rendering a JSON payload the backend already assembled. It also means the
backend API is a stable contract that a different frontend (mobile app, Slack bot,
internal CLI) could reuse without touching agent code.

### Why Mastra exists

Without a framework, "build an agent" means hand-rolling: a loop that calls the LLM,
parses tool-call requests out of the response, executes the right function, feeds
results back, and repeats until the model stops asking for tools — plus schema
validation, error handling, and (if you want it) memory and workflow orchestration.
Mastra (`@mastra/core`) provides that loop (`agent.generate()`), a typed tool definition
API (`createTool`), and a typed multi-step workflow API (`createWorkflow`/`createStep`)
so that code is written once, correctly, instead of reimplemented per project. See
`backend/src/modules/agents/mastra.service.ts` for where this project's three agents are
constructed, and `backend/src/modules/workflows/executive-briefing.workflow.ts` for the
workflow API in use.

### Why agents need tools

An LLM alone can only produce text conditioned on its training data and whatever's in the
prompt. Tools are how it gets access to *live, private, or computed* information (today's
CRM data, a real search result, a calculation) and, in systems that allow it, how it takes
action. Without tools, "which customers should we prioritize" is a guess; with the
`getMigrationOpportunities` tool, it's a query against real records.

### Why enterprise AI needs grounding

An ungrounded assistant that occasionally states a wrong number, a wrong policy, or a
fabricated customer detail is not just inaccurate — in an enterprise context it can drive
a real business decision (which customer to prioritize, what to tell a customer about
compliance) based on something the model made up. Grounding — forcing every substantive
claim to trace back to a retrieved document or a tool result — is what makes an
enterprise AI system trustworthy enough to put in front of account teams. This is why
`CLOUD_PARTNERSHIP_AGENT_INSTRUCTIONS` (`backend/src/modules/agents/agent.config.ts`)
explicitly instructs the agent never to fabricate facts and to say so plainly when a tool
returns nothing relevant, and why the "Agent Activity View" surfaces exactly which tools
ran and what they returned — so a human can verify the answer, not just trust it.

## Production Considerations

**Security.** There's no authentication or authorization anywhere in this demo — every
request is implicitly trusted. A production version needs: authenticated sessions,
per-user/per-role authorization on which customers a user can query (this matters a lot
for an agent that can freely call `getCustomer` for any `customerId`), secrets management
for the LLM API key and MongoDB credentials (currently plain env vars), and network
isolation so the MCP server and Qdrant aren't reachable from outside the backend's trust
boundary.

**Permissions.** Beyond authn/authz, an agent that can call tools needs a permission
model *for the tools themselves* — e.g. a support rep's agent session shouldn't be able
to call a hypothetical `updateCustomerRecord` tool even if the LLM decides to try. This
project only exposes read tools plus a human-gated action-approval queue
(`backend/src/modules/workflows/workflows.service.ts`) specifically so the agent can
never take a write action unilaterally — that pattern (propose, don't execute) is the
right default until a real permission model exists.

**Observability.** Right now, the only trace of what an agent did is what's returned in
the HTTP response (and NestJS's console logs). Production needs: structured logging of
every tool call and its latency, LLM request/response logging (with PII-aware redaction),
distributed tracing across NestJS → Mastra → MCP server → MongoDB/Qdrant, and dashboards
for tool-call volume, error rates, and latency per tool. Mastra has built-in telemetry
hooks (`OtelConfig` in the `Mastra` constructor) that this project leaves off for
simplicity but would be the natural place to wire this in.

**Evaluation.** There's no automated check that the agent's answers are actually correct
or well-grounded. A production system needs offline evals (a fixed set of
question/expected-answer or question/expected-tool-calls pairs run against every model or
prompt change) and online evals (sampling live traffic for human or LLM-judge review,
tracking hallucination/grounding rate over time). Mastra supports `evals` on an `Agent`
config for exactly this, unused here for scope reasons.

**Cost management.** Every chat turn can make multiple LLM calls (the initial reasoning
call plus one per tool-call round) and the embedding model runs on every ingested chunk
and every query. At scale you'd want: token/cost tracking per request, caching of
repeated embedding queries, a cheaper/faster model for simple lookups and a stronger model
reserved for synthesis-heavy work (e.g. the executive briefing), and rate limiting to
prevent runaway agentic loops (this project caps tool-calling at `maxSteps: 5` as a basic
guard).

**Scaling.** The current design already isolates concerns in a way that scales
reasonably: the CRM MCP server is stateless per-request and can run multiple replicas
behind a load balancer; Qdrant and MongoDB are separate scalable services; the NestJS
backend holds no significant in-process state except the demo action-approval queue
(which would need to move to a real datastore first). The main thing that wouldn't scale
as-is: the local embedding model runs in the same process as the API server, so a burst of
document uploads would compete with API request handling for CPU — in production that
would move to a separate embedding worker/service.
