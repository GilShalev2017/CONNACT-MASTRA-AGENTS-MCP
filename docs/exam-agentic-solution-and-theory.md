---
title: "Exam: CONNACT-MASTRA-AGENTS-MCP — Solution Design & AI Agent Theory"
---

# Exam: Agentic Solution Design & AI Theory

**Instructions:** Each question is multiple choice with one correct answer unless marked otherwise. Answers and explanations are provided in the **Answer Key** section at the end of the document. Do not peek ahead!

---

## Section A — Solution Design & Implementation (CONNACT-MASTRA-AGENTS-MCP)

**A1.** Which method call implements the agentic loop for the `CloudPartnershipAgent`?

- A. `this.cloudPartnershipAgent.stream(message)`
- B. `this.cloudPartnershipAgent.generate(message, { maxSteps: 5 })`
- C. `this.cloudPartnershipAgent.run({ steps: 5 })`
- D. `this.mcpClient.loop(message, 5)`

**A2.** What is the maximum number of tool-calling steps the `CloudPartnershipAgent` can take before it is forced to return a final answer?

- A. 1 (single tool call only)
- B. 3
- C. 5
- D. Unlimited — it stops only when the model chooses to

**A3.** Which two categories of tools are wired into the `CloudPartnershipAgent`?

- A. A web-search tool and a code-execution tool
- B. A RAG tool (`searchKnowledgeBase`) and CRM tools (`getCustomer`, `getCustomerHistory`, `getMigrationOpportunities`, `getCustomerCloudUsage`, `listCustomers`)
- C. A calendar tool and an email-sending tool
- D. A SQL query tool and a file-system tool

**A4.** How do the CRM tools actually fetch customer data?

- A. Direct MongoDB queries from inside the backend process
- B. Direct calls to a third-party CRM's public REST API
- C. By calling a standalone MCP server over HTTP, which itself queries MongoDB
- D. By reading static JSON files bundled with the backend

**A5.** What transport does the MCP client/server pair use?

- A. stdio (spawned child process)
- B. WebSockets
- C. Streamable HTTP (`StreamableHTTPServerTransport` / `StreamableHTTPClientTransport`), stateless
- D. gRPC

**A6.** Which embedding model and vector store power the RAG pipeline?

- A. OpenAI `text-embedding-3-small` + Pinecone
- B. Local Transformers.js `Xenova/all-MiniLM-L6-v2` (384-dim) + Qdrant (`connact_knowledge` collection, Cosine distance)
- C. Cohere embeddings + Weaviate
- D. Anthropic embeddings + pgvector

**A7.** How are knowledge-docs chunked before embedding?

- A. By Markdown heading (one chunk per `##` section)
- B. By fixed token count using a tokenizer
- C. By a sliding word-count window: 180 words per chunk, 30-word overlap
- D. Whole-document embeddings, no chunking

**A8.** When does document ingestion into the vector store happen?

- A. Via a manually-triggered `npm run ingest` script
- B. On every backend request, re-embedding all documents
- C. Automatically in `DocumentService.onModuleInit`, only if the collection is currently empty
- D. It never happens automatically — an admin must upload each file through the UI

**A9.** Which LLM provider/model does the backend use to power the agents?

- A. OpenAI GPT-4o via `@ai-sdk/openai`
- B. Anthropic, via `@ai-sdk/anthropic`, model id from `ANTHROPIC_MODEL` (default `claude-sonnet-5`)
- C. A locally-hosted Llama model via Ollama
- D. Google Gemini via Vertex AI

**A10.** How do `meetingAnalysisAgent` and `executiveBriefingAgent` differ from `CloudPartnershipAgent` in terms of agentic behavior?

- A. They use a larger `maxSteps` value for deeper reasoning
- B. They call `.generate()` with no tools and no `maxSteps` — one-shot structured-output calls, not loops
- C. They run entirely on the frontend
- D. They use a different LLM provider

**A11.** What implements the `executive-briefing` feature's control flow?

- A. A second agentic loop with `maxSteps: 10`
- B. A fixed, linear Mastra `Workflow`: `gatherCrmContext → gatherKnowledgeContext → synthesizeBriefing`, explicitly non-agentic/deterministic
- C. A recursive agent-calls-agent pattern
- D. A cron job that polls the CRM every hour

**A12.** How does the solution enforce grounding / prevent hallucination in agent outputs?

- A. A post-hoc fact-checking model reviews every response before it's returned
- B. Explicit instructions in the agent's system prompt (e.g., "Never fabricate customer facts... say so plainly instead of guessing") combined with tool-based retrieval rather than relying on parametric knowledge
- C. Output is only ever a fixed template with no free-text generation
- D. All numeric claims are automatically footnoted by a separate service

**A13.** How are structured outputs (e.g., meeting analysis, executive briefing) enforced?

- A. By asking the model nicely in the prompt to "please respond in JSON"
- B. By parsing free-text output with regex after generation
- C. Via a Zod schema passed as `{ output: schema }` into `.generate()`
- D. Via a separate LLM call that reformats the first response

**A14.** True or false: The backend persists conversation history and reloads it on each turn using Mastra's `Memory` feature.

- A. True — every agent call is preceded by a memory lookup
- B. False — a `conversationId` is generated/echoed back, but it is never persisted or used to reload prior turns; each `.generate()` call is stateless
- C. True, but only for the `CloudPartnershipAgent`
- D. False — memory is stored in Qdrant alongside document embeddings

**A15.** What authentication/authorization exists on the backend's chat endpoint?

- A. JWT-based auth with per-user rate limiting
- B. API-key auth via a NestJS guard
- C. None — no guards/middleware were found protecting the endpoint
- D. OAuth2 via an external identity provider

**A16.** How does the frontend communicate with the backend agent, and does it stream tokens?

- A. WebSocket connection with token-by-token streaming
- B. Server-Sent Events (SSE) streaming the agent's reasoning steps live
- C. Plain REST: `POST /api/chat` with `{message, conversationId}`, awaiting the full JSON response — no streaming
- D. GraphQL subscription

---

## Section B — AI Agent Theory (Agents, Tools, Flows, Agentic Loops, MCP, Prompts, Grounding, RAG)

**B1.** What best defines an "agentic loop" in the context of LLM-based systems?

- A. A single prompt/response exchange with no external actions
- B. A repeating cycle of the model reasoning, choosing a tool/action, observing the result, and reasoning again, continuing until a stopping condition (final answer or step limit) is reached
- C. A `for` loop in application code that calls the LLM API multiple times with the same prompt
- D. A caching mechanism that reuses previous LLM responses

**B2.** In tool-calling agent frameworks, what is the purpose of a "tool" (a.k.a. "function") definition?

- A. It's purely cosmetic UI metadata for a chat interface
- B. It gives the model a formally-described interface (name, description, input/output schema) so it can request an external action, which the host application executes and returns results for
- C. It replaces the need for a system prompt
- D. It is only used for logging purposes and never actually executed

**B3.** What is the Model Context Protocol (MCP)?

- A. A proprietary Anthropic-only prompt format
- B. An open protocol standardizing how AI applications connect to external tools, data sources, and systems via a common client-server interface, independent of any single model provider
- C. A database replication protocol
- D. A method for compressing conversation context to save tokens

**B4.** In MCP terminology, what is the difference between an MCP "tool" and an MCP "resource"?

- A. There is no difference — the terms are interchangeable
- B. Tools are model-invoked actions/functions (often with side effects or computation); resources are addressable, typically read-only data/context the client can fetch and expose to the model
- C. Resources always cost money to call; tools are always free
- D. Tools run on the client; resources run on the server

**B5.** Why might an MCP server use a stateless "Streamable HTTP" transport instead of the stdio transport?

- A. Stdio is faster but insecure
- B. Streamable HTTP allows a remote, independently-deployable server reachable over the network (e.g., in its own container), whereas stdio requires the server to be a local child process of the client
- C. Streamable HTTP is required by the MCP spec; stdio is deprecated
- D. There is no meaningful difference in deployment topology

**B6.** What does "grounding" mean in the context of LLM applications?

- A. Lowering the model's temperature to 0
- B. Constraining/connecting the model's output to verifiable external data (retrieved documents, tool results, structured facts) rather than relying solely on the model's parametric memory, to reduce hallucination
- C. Running the model on-premises instead of via API
- D. Fine-tuning the model on a company's data

**B7.** What is Retrieval-Augmented Generation (RAG)?

- A. A technique where the model generates multiple candidate answers and votes on the best one
- B. A pattern that retrieves relevant external documents/passages (typically via semantic/vector search) and injects them into the prompt context so the model can generate answers grounded in that retrieved content
- C. A method of retraining the model weights on new documents every time a query arrives
- D. A caching layer that returns a stored answer if the same question was asked before

**B8.** In a typical RAG pipeline, what is the role of an embedding model?

- A. It generates the final natural-language answer
- B. It converts text (queries and documents) into dense numeric vectors such that semantically similar text ends up close together in vector space, enabling similarity search
- C. It compresses documents for storage without regard to meaning
- D. It replaces the need for a vector database

**B9.** Why is document "chunking" necessary in RAG systems?

- A. It is not necessary; whole documents should always be embedded as-is
- B. Long documents exceed practical embedding/context limits and dilute relevance; splitting into smaller, semantically coherent (often overlapping) chunks improves retrieval precision and lets only relevant pieces be injected into the prompt
- C. Chunking is only needed for images, not text
- D. Chunking is a step that happens after generation, not before

**B10.** What is a common purpose of overlap between consecutive chunks (e.g., a 30-word overlap between 180-word chunks)?

- A. To increase storage costs intentionally
- B. To avoid splitting a relevant idea/sentence awkwardly across a chunk boundary, so context near the edges isn't lost
- C. To make embeddings deterministic
- D. Overlap has no practical effect and is purely a convention

**B11.** What does a vector database's "distance metric" (e.g., Cosine similarity) determine?

- A. How many tools the agent can call per step
- B. How "closeness"/similarity between two embedding vectors is measured/scored during nearest-neighbor search
- C. The physical storage location of the database
- D. The maximum number of documents that can be stored

**B12.** What is the main risk of NOT grounding an agent that answers questions about live business data (e.g., customer records)?

- A. Increased latency only
- B. The model may hallucinate plausible-sounding but false facts (e.g., invented customer names, numbers, or history) because it has no access to authoritative live data
- C. Higher API costs only
- D. There is no risk if the system prompt is well-written

**B13.** In an agent system prompt, what is the purpose of an explicit "tool-selection policy" (e.g., "use the RAG tool for policy questions, use CRM tools for customer facts, combine both when needed")?

- A. It's decorative and has no measurable effect on behavior
- B. It guides the model's decision-making at each loop step toward choosing the right action, improving reliability and reducing unnecessary or incorrect tool calls
- C. It replaces the need for tool schemas entirely
- D. It is only relevant for multi-agent systems, not single agents

**B14.** What is the benefit of enforcing a structured output schema (e.g., via Zod/JSON Schema) on an LLM's final response?

- A. It makes the model's response faster to generate
- B. It guarantees the response conforms to a predictable, machine-parseable shape, making downstream code (UI rendering, further processing) reliable instead of parsing free-form text
- C. It prevents the model from ever making factual errors
- D. It eliminates the need for a system prompt

**B15.** What distinguishes a deterministic "workflow" (fixed sequence of steps) from an "agentic loop" in orchestration design?

- A. Workflows cannot call tools at all, ever
- B. A workflow executes a predefined, typically linear/branching sequence of steps regardless of intermediate content; an agentic loop lets the model itself decide, at runtime, which action (if any) to take next and when to stop
- C. Agentic loops are always faster than workflows
- D. There is no real distinction; the terms are synonyms

**B16.** Why might a system design deliberately use a plain deterministic workflow (rather than a free-form agentic loop) for a task like "generate an executive briefing from CRM + knowledge-base context"?

- A. Because workflows are cheaper to run in all cases
- B. Because the task's steps and data sources are known in advance, so a fixed pipeline gives more predictable behavior, cost, and latency than letting the model improvise tool calls
- C. Because agentic loops cannot use structured output schemas
- D. Because MCP servers cannot be called from a workflow

**B17.** What is "conversation memory" in the context of an agent framework (e.g., Mastra's `Memory` feature), and why does its absence matter?

- A. It refers to GPU memory allocated to the model; its absence only affects performance
- B. It's a mechanism for persisting and reloading prior conversation turns/context across requests; without it, each call is stateless, so the agent has no awareness of earlier turns in the same conversation beyond what the caller resends
- C. It is a synonym for the vector database used in RAG
- D. It has no relationship to multi-turn conversations

**B18.** Which best describes the difference between an LLM "hallucination" and a "grounded" answer produced via tool use?

- A. There is no difference; both terms describe the same phenomenon
- B. A hallucination is a fluent but unverified/fabricated claim generated from the model's internal parameters; a grounded answer is derived from and traceable to retrieved/tool-provided evidence
- C. Hallucinations only occur with small models; large models never hallucinate
- D. Grounded answers are always shorter than hallucinated ones

**B19.** Why does giving an agent a bounded step limit (e.g., `maxSteps: 5`) matter operationally?

- A. It has no operational purpose, it is just a default value
- B. It caps latency/cost and prevents runaway loops where the model repeatedly calls tools without converging on an answer
- C. It determines how many tools the agent has access to
- D. It is required by the MCP specification

**B20.** In multi-tool agents, why is providing an explicit input/output schema (e.g., via Zod) for each tool important, beyond documentation?

- A. It has no functional effect, it's purely for developers reading the code
- B. It lets the framework validate/coerce the model's tool-call arguments and the tool's return value at runtime, catching malformed calls before they reach business logic
- C. It automatically improves the underlying LLM's reasoning ability
- D. It is only used to generate API documentation websites

---

## Section C — NestJS Backend Implementation

**C1.** What decorator and route prefix does the chat endpoint use?

- A. `@Controller("chat")` with a `@Get()` handler
- B. `@Controller("api/chat")` with a single `@Post()` handler calling `mastraService.chat(...)`
- C. `@Controller("api/agents")` with `@Post("chat")`
- D. No controller — the chat route is defined directly in `main.ts`

**C2.** How is file upload handled in `DocumentController`?

- A. A raw Express middleware parses `multipart/form-data` manually
- B. `@Post("upload")` combined with `@UseInterceptors(FileInterceptor("file"))` and a `@UploadedFile()` parameter, throwing `BadRequestException` if no file is present
- C. Files are uploaded directly to Qdrant via a gRPC stream
- D. `@Body()` alone is used to receive the raw file buffer

**C3.** Which NestJS module wires up file-upload size limits, and how?

- A. `AgentsModule`, via a custom `FileSizeGuard`
- B. `DocumentsModule`, via `MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } })`
- C. `VectorModule`, via a Qdrant collection quota
- D. It's hardcoded in `main.ts` as an Express body-parser limit

**C4.** How are Mongoose schemas defined and registered for `Customer`, `Document`, and `Meeting` entities?

- A. Using plain Mongoose `Schema` objects with no decorators, registered in `app.module.ts` only
- B. Using `@Schema()`/`@Prop()` decorators to define entity classes, then `SchemaFactory.createForClass(Entity)`, registered per-feature-module via `MongooseModule.forFeature([...])`
- C. Using GraphQL type definitions that NestJS auto-converts to Mongoose schemas
- D. Schemas are defined directly inside the controllers

**C5.** Where is the MongoDB connection itself established, and how?

- A. In each feature module independently via `MongooseModule.forRoot()`
- B. In `AppModule`, via `MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: ... })`
- C. In `main.ts`, via a manual `mongoose.connect()` call before `NestFactory.create()`
- D. MongoDB connects lazily on first query with no explicit setup

**C6.** How is configuration (`port`, `mongoUrl`, `qdrant`, `llm`, etc.) loaded and made available across the app?

- A. Via `process.env` accessed directly in every service
- B. Via a plain factory function in `configuration.ts` passed to `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })`, then consumed everywhere via injected `ConfigService.get<T>("key.path")`
- C. Via a JSON file read synchronously in each module's constructor
- D. Via `registerAs()` namespaced configs only, with no global module

**C7.** What request validation is actually applied to the `/api/chat` endpoint's request body?

- A. A Zod schema, matching the tool-output validation style used elsewhere
- B. A `ChatRequestDto` class using `class-validator` decorators (`@IsString()`, `@MinLength(1)` on `message`; `@IsOptional() @IsString()` on `conversationId`), enforced by a global `ValidationPipe`
- C. No validation at all — the body is passed straight to the agent
- D. A custom `PipeTransform` that manually checks `typeof body.message === "string"`

**C8.** Where and how is the global `ValidationPipe` registered, and with what options?

- A. Per-controller via `@UsePipes(new ValidationPipe())` on each controller
- B. In `main.ts`, via `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`
- C. It isn't registered globally; only `AgentsModule` applies it
- D. Inside `ChatRequestDto` itself via a class decorator

**C9.** True or false: Zod schemas (as seen in `mastra.service.ts` for structured LLM output) and `class-validator` DTOs (as seen in `ChatRequestDto`) serve the same layer of the application.

- A. True — both validate incoming HTTP request bodies
- B. False — `class-validator`/`ValidationPipe` validates incoming HTTP request bodies at the controller boundary, while Zod schemas constrain/validate LLM tool-call arguments and structured generation output, a different boundary entirely
- C. True — Zod replaced class-validator everywhere in this codebase
- D. False — Zod is only used in the frontend, never the backend

**C10.** How does the codebase handle cross-cutting error handling for LLM-related failures (e.g., missing/invalid API keys)?

- A. A try/catch block duplicated in every controller method
- B. A global exception filter, `LlmErrorFilter`, decorated with `@Catch()` (catch-all) and registered via `app.useGlobalFilters(new LlmErrorFilter())` in `main.ts`; it passes through existing `HttpException`s and maps API-key-related error messages to a `503 SERVICE_UNAVAILABLE`
- C. A NestJS Guard that blocks requests if the API key is missing
- D. An interceptor that retries failed LLM calls up to 3 times automatically

**C11.** Are there any custom NestJS Guards (`CanActivate`) or Pipes (`PipeTransform`) in this codebase, besides the global `ValidationPipe`?

- A. Yes — an `AuthGuard` protects all `/api` routes
- B. No — no custom Guards or Pipes exist anywhere in the repo; the only pipe in use is the built-in global `ValidationPipe`
- C. Yes — a custom `RoleGuard` restricts CRM tool access
- D. Yes — a `ParseObjectIdPipe` validates all Mongo ObjectId route params

**C12.** How is CORS configured for the backend?

- A. It isn't configured — CORS is fully open by default
- B. Via `app.enableCors({ origin: config.get("corsOrigin"), credentials: true })` in `main.ts`
- C. Via a third-party `cors` Express middleware registered manually
- D. Via a NestJS `@Cors()` decorator on `AppModule`

**C13.** Which modules does `AgentsModule` import, and why?

- A. None — it's fully self-contained
- B. `VectorModule` and `McpModule`, because `MastraService` needs the RAG vector search and the MCP client to build the `CloudPartnershipAgent`'s tools
- C. `CustomersModule` and `TranscriptionModule`, to directly query Mongo itself
- D. Only `McpModule`; RAG is handled inside `AgentsModule` itself

**C14.** How does `WorkflowsController`'s action-decision endpoint validate the incoming decision value?

- A. Via a dedicated DTO with a `class-validator` `@IsIn(["approve", "reject"])` decorator
- B. Inline in the controller/service logic, throwing a `BadRequestException` if the decision value isn't recognized — no dedicated DTO/class-validator is used for this route
- C. Via a Zod schema shared with the LLM tool definitions
- D. It isn't validated; any string is accepted and stored as-is

**C15.** What dependency-injection pattern is used to give services access to their Mongoose models?

- A. `@Inject("CUSTOM_TOKEN")` with manually registered custom providers
- B. `@InjectModel(Entity.name)` constructor-parameter decorators (e.g. in `DocumentService`, `CustomerService`, `TranscriptionService`)
- C. A singleton `DatabaseManager` class instantiated manually in each service
- D. Property injection via `@Autowired`-style decorators

---

## Section D — React Frontend Implementation

**D1.** Which data-fetching library powers all server-state management in the frontend, and where is its client configured?

- A. SWR, configured in `App.tsx`
- B. `@tanstack/react-query`, with `QueryClient` instantiated in `main.tsx` (`defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } }`) and `QueryClientProvider` wrapping the app
- C. Apollo Client, configured for a GraphQL backend
- D. Axios interceptors with a custom in-memory cache

**D2.** How does the frontend make HTTP calls to the backend — what does `src/api/client.ts` use?

- A. Axios, with a shared instance and interceptors for error handling
- B. Native `fetch`, via a generic `request<T>(path, init)` helper that prefixes calls with `/api` and throws an `Error` on non-OK responses
- C. `XMLHttpRequest` wrapped in a custom promise utility
- D. GraphQL queries sent over a WebSocket

**D3.** Which `useQuery` call is configured with `enabled: !!selected`, and why?

- A. The `["customers"]` query, to avoid fetching until the page mounts
- B. The `["meetings", selected]` query in `CustomersPage`, so it only runs once a customer is selected
- C. The `["documents"]` query, to avoid re-fetching after upload
- D. The `["actions"]` query, to avoid polling before the workflow page loads

**D4.** After a successful document upload mutation, how does the UI refresh the document list?

- A. It doesn't — the user must manually reload the page
- B. The `onSuccess` callback calls `queryClient.invalidateQueries({ queryKey: ["documents"] })`, prompting React Query to refetch the `["documents"]` query
- C. A `useEffect` polls the documents endpoint every 5 seconds
- D. `window.location.reload()` is called inside the mutation

**D5.** How many distinct `useMutation` calls exist in the frontend, and what do they cover?

- A. One — only the chat send action
- B. Four — sending a chat message, uploading a document, generating an executive briefing, and approving/rejecting a recommended action
- C. Six — including login and logout mutations
- D. Two — chat send and document upload only

**D6.** Does the chat-sending mutation invalidate any React Query cache entries on success?

- A. Yes, it invalidates `["chat"]`
- B. No — its `onSuccess` handler updates local component state (`conversationId.current`, appended assistant message, `activeResponse`) rather than calling `invalidateQueries`
- C. Yes, it invalidates `["customers"]` since chat can reference customer data
- D. Yes, it invalidates all active queries globally

**D7.** How is the chat conversation ID tracked across messages within `ChatPage`?

- A. In global state via a Context Provider
- B. In a `useRef<string | undefined>`, not `useState`, since updating it should not trigger a re-render on its own
- C. In the URL as a route param via `react-router-dom`
- D. In `localStorage`, read on every render

**D8.** Does this codebase use `useEffect` anywhere (e.g., to auto-scroll the chat panel)?

- A. Yes, extensively, for scrolling, polling, and subscriptions
- B. No — `useEffect` is not used anywhere in the frontend; for example, chat scrolling relies on plain CSS (`overflow-y-auto`) rather than a scroll-effect hook
- C. Yes, but only in `AgentActivityPanel.tsx`
- D. Yes, in `main.tsx` to initialize the query client

**D9.** What global state management approach (Redux, Zustand, Context API) does this frontend use?

- A. Redux Toolkit, with a single root store
- B. None of those — there is no `React.createContext`/`useContext`, no Redux, no Zustand; all local UI state uses `useState`, and all server state lives in React Query's cache
- C. Zustand, with one store per page
- D. The Context API, with a single `AppStateContext`

**D10.** How does the frontend implement client-side routing, and what routes exist?

- A. Manual state-based tab switching, no router library
- B. `react-router-dom`'s `BrowserRouter`/`Routes`, with routes `/` (ChatPage), `/customers` (CustomersPage), `/documents` (DocumentsPage), and `/workflows` (WorkflowsPage)
- C. Next.js file-based routing
- D. Hash-based routing implemented manually with `window.location.hash`

**D11.** What styling approach does the frontend use?

- A. Material UI (MUI) component library
- B. Tailwind CSS utility classes with a custom `brand` color, no component library like MUI/shadcn
- C. Styled-components (CSS-in-JS)
- D. Plain hand-written CSS files per component, no utility framework

**D12.** Are there any custom React hooks (files whose name starts with `use`) in this codebase?

- A. Yes — `useChat`, `useCustomers`, and `useDocuments` custom hooks wrap the React Query calls
- B. No — no custom hooks exist; `useQuery`/`useMutation`/`useState`/`useRef` are called directly inside page components
- C. Yes — a single `useApi` hook wraps the `fetch` client
- D. Yes — `useAgentActivity` centralizes the activity-panel logic

**D13.** How are shared TypeScript types (e.g., `ChatResponse`, `Customer`, `RecommendedAction`) organized?

- A. Duplicated inline in every component that needs them
- B. Centralized in a single `src/types.ts` file, imported wherever needed (e.g., by `api/client.ts` and page components)
- C. Auto-generated from the NestJS DTOs via a codegen step
- D. Defined as Zod schemas shared directly with the backend

**D14.** How does `AgentActivityPanel.tsx` receive the data it renders (`steps`, `toolCalls`, `sources`)?

- A. It calls its own `useQuery` to fetch the latest chat response independently
- B. Purely via props — it's a presentational component with no hooks of its own, rendering fields passed down from the parent's `ChatResponse` state
- C. Via `useContext`, reading from a shared `ChatContext`
- D. Via a `useEffect` that subscribes to a WebSocket stream

**D15.** How is the document-upload file input handled after a successful upload?

- A. The page fully remounts via a `key` prop change
- B. The mutation's `onSuccess` clears the file input using a ref, alongside invalidating the `["documents"]` query
- C. The file input is uncontrolled and never reset; the user must refresh manually
- D. `useState` holds the `File` object and is reset via a `useEffect` cleanup function

---

## Answer Key & Explanations

### Section A — Solution Design & Implementation

| # | Answer | Explanation |
|---|--------|-------------|
| A1 | **B** | `mastra.service.ts:118` calls `this.cloudPartnershipAgent.generate(message, { maxSteps: 5 })`, the sole agentic-loop entry point in the codebase. |
| A2 | **C** | `maxSteps: 5` caps the internal decide→act→observe cycle at 5 iterations before the model must return a final answer. |
| A3 | **B** | `mastra.service.ts:71-76` wires `tools: { searchKnowledgeBase, ...crmTools }` — a RAG tool plus 5 CRM tools defined in `crm.tools.ts:11-48`. |
| A4 | **C** | CRM tools call `mcp-client.service.ts`'s `callTool()`, which talks to the standalone `mcp-server` over HTTP; that server queries MongoDB (`mcp-server/src/tools.ts:10-97`). |
| A5 | **C** | Both sides use `StreamableHTTPServerTransport`/`StreamableHTTPClientTransport`, statelessly (`sessionIdGenerator: undefined`, fresh server+transport per POST). |
| A6 | **B** | `embedding.service.ts` uses local Transformers.js `Xenova/all-MiniLM-L6-v2` (384-dim, mean pooling, normalized); `vector.service.ts` stores vectors in Qdrant collection `connact_knowledge` with Cosine distance. |
| A7 | **C** | `common/chunking.ts:12-13` implements a sliding word-count window: 180 words per chunk with 30-word overlap — no tokenizer awareness. |
| A8 | **C** | `DocumentService.onModuleInit` (`document.service.ts:50-87`) auto-bootstraps ingestion only when the collection's document count is zero; there is no manual ingestion CLI for knowledge-docs. |
| A9 | **B** | `common/llm.ts:9-15` uses `@ai-sdk/anthropic`'s `createAnthropic`, model id from env `ANTHROPIC_MODEL`, defaulting to `claude-sonnet-5`. |
| A10 | **B** | Both agents call `.generate()` without tools or `maxSteps`, making them single-shot structured-output generations rather than agentic loops. |
| A11 | **B** | `executive-briefing.workflow.ts` builds a Mastra `Workflow` chaining `gatherCrmContext → gatherKnowledgeContext → synthesizeBriefing` via `.then()...commit()` — an explicitly deterministic, non-agentic pipeline (per the file's own comments). |
| A12 | **B** | The agent's system prompt (`agent.config.ts`) explicitly instructs it not to fabricate customer facts and to admit uncertainty, while relying on tool-retrieved data rather than the model's own memory. |
| A13 | **C** | Structured outputs use Zod schemas (`meetingAnalysisOutputSchema`, `executiveBriefingOutputSchema`) passed as `{ output: schema }` into `.generate()`, not prompt-only requests or post-hoc parsing. |
| A14 | **B** | `mastra.service.ts` generates/echoes a `conversationId` but never persists or reloads history; no Mastra `Memory` feature is wired in — each call is stateless (explicitly noted as a TODO in comments). |
| A15 | **C** | No guards, middleware, or auth mechanism was found protecting `POST /api/chat` or any other backend route. |
| A16 | **C** | `frontend/src/api/client.ts` performs a plain `fetch` `POST /api/chat` with `{message, conversationId}` and awaits the full JSON response — no WebSocket/SSE streaming is implemented. |

### Section B — AI Agent Theory

| # | Answer | Explanation |
|---|--------|-------------|
| B1 | **B** | The defining feature of an agentic loop is the model's own reasoning driving repeated tool use until it decides it's done (or a limit is hit) — not merely calling an API in a loop from outside code. |
| B2 | **B** | A tool definition exposes a callable capability to the model with a schema so the model can request it and the host can execute it and feed results back. |
| B3 | **B** | MCP is an open, model-agnostic protocol for connecting AI applications to tools/data sources via a standard client-server architecture. |
| B4 | **B** | Tools are actions the model can invoke (may have side effects); resources are addressable data the client can retrieve and supply as context — a distinct primitive in MCP's spec. |
| B5 | **B** | Stateless Streamable HTTP lets the MCP server run as an independent, network-reachable service (its own container/host), unlike stdio which ties the server to a local child process. |
| B6 | **B** | Grounding means tethering output to verifiable external facts/data instead of trusting the model's internal (parametric) knowledge alone, which reduces hallucination risk. |
| B7 | **B** | RAG retrieves relevant passages (typically via vector similarity search) and injects them into the prompt so generation is grounded in that retrieved content. |
| B8 | **B** | Embedding models map text to vectors positioned by semantic similarity, which is what enables nearest-neighbor retrieval in a vector store. |
| B9 | **B** | Chunking keeps pieces small and topically coherent so retrieval returns focused, relevant context instead of noisy, oversized documents. |
| B10 | **B** | Overlap prevents a relevant sentence/idea from being cut in half at a chunk boundary, preserving local context. |
| B11 | **B** | A distance/similarity metric (e.g., cosine) defines how "close" two vectors are considered, which directly determines search ranking/results. |
| B12 | **B** | Without grounding, a model answering about live/dynamic business data has nothing but its stale/generic training data to draw on, inviting fabricated specifics. |
| B13 | **B** | An explicit tool-selection policy in the system prompt shapes the model's per-step decisions, improving reliability of the agentic loop's action choices. |
| B14 | **B** | Schema-enforced structured output guarantees a predictable shape for downstream consumption (UI, further logic), rather than relying on fragile text parsing. |
| B15 | **B** | The core distinction is *who decides the next step*: a workflow's sequence is fixed by the developer; an agentic loop's sequence is decided dynamically by the model at runtime. |
| B16 | **B** | When the required steps and data sources are already known and fixed, a deterministic workflow gives more predictable cost/latency/behavior than letting a model improvise via an agentic loop. |
| B17 | **B** | Conversation memory persists/reloads prior turns across requests; its absence means every call is self-contained and the agent "forgets" earlier turns unless the caller resupplies them. |
| B18 | **B** | Hallucination = fluent but unverified/fabricated model output from parametric memory; grounded answer = traceable to actual retrieved/tool-sourced evidence. |
| B19 | **B** | A step cap bounds worst-case latency/cost and guards against a model looping indefinitely without producing a final answer. |
| B20 | **B** | Tool schemas allow the framework to validate/coerce arguments and return values at runtime, catching malformed model output before it reaches application logic — a functional (not just documentation) benefit. |

### Section C — NestJS Backend Implementation

| # | Answer | Explanation |
|---|--------|-------------|
| C1 | **B** | `agents.controller.ts:13` uses `@Controller("api/chat")` with one `@Post()` handler calling `mastraService.chat(...)`. |
| C2 | **B** | `document.controller.ts:19-25` combines `@Post("upload")`, `@UseInterceptors(FileInterceptor("file"))`, and `@UploadedFile()`, throwing `BadRequestException` when no file is supplied. |
| C3 | **B** | `documents.module.ts:9-19` registers `MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } })` alongside the Mongoose feature and `VectorModule`. |
| C4 | **B** | Entities like `CustomerEntity`/`DocumentEntity`/`MeetingEntity` use `@Schema()`/`@Prop()`, are turned into schemas via `SchemaFactory.createForClass`, and registered per-module with `MongooseModule.forFeature([...])`. |
| C5 | **B** | The actual DB connection is established once, in `app.module.ts:16-19`, via `MongooseModule.forRootAsync({ inject: [ConfigService], useFactory })` — feature modules only register schemas, not connections. |
| C6 | **B** | `configuration.ts:9-29` is a plain factory (not `registerAs`) loaded via `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })`; every service reads values with injected `ConfigService.get<T>("key.path")`. |
| C7 | **B** | `ChatRequestDto` (`agents/dto/chat.dto.ts`) applies `class-validator` decorators, and the global `ValidationPipe` (registered in `main.ts`) enforces them — Zod is not used for this HTTP boundary. |
| C8 | **B** | `main.ts:13` calls `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`, applying to every route, not per-controller. |
| C9 | **B** | `class-validator`/`ValidationPipe` guards the HTTP request-body boundary; Zod schemas in `mastra.service.ts` constrain a completely different boundary — LLM tool arguments/structured output. The two don't overlap. |
| C10 | **B** | `LlmErrorFilter` (`common/filters/llm-error.filter.ts:14`) is a catch-all `@Catch()` filter registered globally via `app.useGlobalFilters(new LlmErrorFilter())` in `main.ts:14`; it re-throws existing `HttpException`s and maps API-key error text to `503`. |
| C11 | **B** | No `CanActivate` guards or custom `PipeTransform` pipes exist in the repo; the only pipe at work is the built-in global `ValidationPipe`. |
| C12 | **B** | `main.ts:12` configures `app.enableCors({ origin: config.get("corsOrigin"), credentials: true })` — there's no separate Express `cors` middleware or decorator. |
| C13 | **B** | `agents.module.ts:14-20` imports `[VectorModule, McpModule]` because `MastraService` needs RAG search and the MCP client to assemble the `CloudPartnershipAgent`'s tool set. |
| C14 | **B** | `WorkflowsController`/`WorkflowsService` validate the decision value inline, throwing `BadRequestException` for unrecognized values — there's no dedicated DTO or `class-validator` rule for this route. |
| C15 | **B** | Services like `DocumentService`, `CustomerService`, and `TranscriptionService` receive their Mongoose models via `@InjectModel(Entity.name)` constructor parameters — no custom DI tokens are used. |

### Section D — React Frontend Implementation

| # | Answer | Explanation |
|---|--------|-------------|
| D1 | **B** | `@tanstack/react-query` (`package.json`) is the sole data-fetching layer; `QueryClient` is created in `main.tsx` with `{ retry: 1, refetchOnWindowFocus: false }` and provided via `QueryClientProvider`. |
| D2 | **B** | `src/api/client.ts` uses native `fetch` through a generic `request<T>(path, init)` helper that prefixes `/api` and throws an `Error` on non-OK responses — no axios anywhere. |
| D3 | **B** | `CustomersPage.tsx:9-13`'s `["meetings", selected]` query passes `enabled: !!selected`, so it only fires once a customer is actually selected. |
| D4 | **B** | The upload mutation's `onSuccess` (`DocumentsPage.tsx:23-29`) calls `queryClient.invalidateQueries({ queryKey: ["documents"] })`, triggering an automatic refetch. |
| D5 | **B** | Four mutations exist: chat send (`ChatPage.tsx`), document upload (`DocumentsPage.tsx`), executive briefing generation, and action approve/reject (both in `WorkflowsPage.tsx`) — there is no auth flow in this app. |
| D6 | **B** | The chat mutation's `onSuccess` updates local state (`conversationId.current`, appended message, `activeResponse`) — it never calls `invalidateQueries`, since chat isn't backed by a cached query. |
| D7 | **B** | `ChatPage.tsx:20` stores `conversationId` in a `useRef`, deliberately avoiding `useState` since changing it shouldn't force a re-render on its own. |
| D8 | **B** | `useEffect` is not used anywhere in the frontend; chat scrolling relies on CSS `overflow-y-auto` rather than a scroll-effect hook. |
| D9 | **B** | There's no Context API, Redux, or Zustand usage — local UI state is plain `useState`, and all server state is cached by React Query. |
| D10 | **B** | `react-router-dom`'s `BrowserRouter`/`Routes` (wired in `main.tsx`/`App.tsx`) define `/`, `/customers`, `/documents`, and `/workflows`. |
| D11 | **B** | Styling is Tailwind CSS utility classes with a custom `brand` color — no MUI, shadcn, or styled-components dependency exists. |
| D12 | **B** | No files with a `use*` custom-hook naming pattern exist; every page calls `useQuery`/`useMutation`/`useState`/`useRef` directly. |
| D13 | **B** | All shared interfaces (`ChatResponse`, `Customer`, `RecommendedAction`, etc.) live in one `src/types.ts`, imported by both the API client and page components. |
| D14 | **B** | `AgentActivityPanel.tsx` is purely presentational — no hooks — rendering `steps`/`toolCalls`/`sources` passed down as props from the parent's `ChatResponse` state. |
| D15 | **B** | The upload mutation's `onSuccess` clears the file input via a ref and invalidates `["documents"]` in the same callback — no full remount or page reload is involved. |

