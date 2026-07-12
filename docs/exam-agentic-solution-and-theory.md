---
title: "Exam: CONNACT-MASTRA-AGENTS-MCP — Solution Design & AI Agent Theory"
---

# Exam: Agentic Solution Design & AI Theory

**Instructions:** Each question is multiple choice with one correct answer unless marked otherwise. Answers and explanations are provided in the **Answer Key** section at the end of the document. Do not peek ahead!

---

## Section A — Solution Design & Implementation (CONNACT-MASTRA-AGENTS-MCP)

**A1.** Which method call implements the agentic loop for the `CloudPartnershipAgent`?

- A. `this.cloudPartnershipAgent.run({ steps: 5 })`
- B. `this.mcpClient.loop(message, 5)`
- C. `this.cloudPartnershipAgent.stream(message)`
- D. `this.cloudPartnershipAgent.generate(message, { maxSteps: 5 })`

**A2.** What is the maximum number of tool-calling steps the `CloudPartnershipAgent` can take before it is forced to return a final answer?

- A. 5
- B. 1 (single tool call only)
- C. 3
- D. Unlimited — it stops only when the model chooses to

**A3.** Which two categories of tools are wired into the `CloudPartnershipAgent`?

- A. A SQL query tool and a file-system tool
- B. A web-search tool and a code-execution tool
- C. A calendar tool and an email-sending tool
- D. A RAG tool (`searchKnowledgeBase`) and CRM tools (`getCustomer`, `getCustomerHistory`, `getMigrationOpportunities`, `getCustomerCloudUsage`, `listCustomers`)

**A4.** How do the CRM tools actually fetch customer data?

- A. Direct calls to a third-party CRM's public REST API
- B. Direct MongoDB queries from inside the backend process
- C. By calling a standalone MCP server over HTTP, which itself queries MongoDB
- D. By reading static JSON files bundled with the backend

**A5.** What transport does the MCP client/server pair use?

- A. Streamable HTTP (`StreamableHTTPServerTransport` / `StreamableHTTPClientTransport`), stateless
- B. WebSockets
- C. gRPC
- D. stdio (spawned child process)

**A6.** Which embedding model and vector store power the RAG pipeline?

- A. Anthropic embeddings + pgvector
- B. Local Transformers.js `Xenova/all-MiniLM-L6-v2` (384-dim) + Qdrant (`connact_knowledge` collection, Cosine distance)
- C. Cohere embeddings + Weaviate
- D. OpenAI `text-embedding-3-small` + Pinecone

**A7.** How are knowledge-docs chunked before embedding?

- A. By fixed token count using a tokenizer
- B. By Markdown heading (one chunk per `##` section)
- C. Whole-document embeddings, no chunking
- D. By a sliding word-count window: 180 words per chunk, 30-word overlap

**A8.** When does document ingestion into the vector store happen?

- A. Via a manually-triggered `npm run ingest` script
- B. On every backend request, re-embedding all documents
- C. Automatically in `DocumentService.onModuleInit`, only if the collection is currently empty
- D. It never happens automatically — an admin must upload each file through the UI

**A9.** Which LLM provider/model does the backend use to power the agents?

- A. Google Gemini via Vertex AI
- B. A locally-hosted Llama model via Ollama
- C. Anthropic, via `@ai-sdk/anthropic`, model id from `ANTHROPIC_MODEL` (default `claude-sonnet-5`)
- D. OpenAI GPT-4o via `@ai-sdk/openai`

**A10.** How do `meetingAnalysisAgent` and `executiveBriefingAgent` differ from `CloudPartnershipAgent` in terms of agentic behavior?

- A. They call `.generate()` with no tools and no `maxSteps` — one-shot structured-output calls, not loops
- B. They use a larger `maxSteps` value for deeper reasoning
- C. They use a different LLM provider
- D. They run entirely on the frontend

**A11.** What implements the `executive-briefing` feature's control flow?

- A. A recursive agent-calls-agent pattern
- B. A cron job that polls the CRM every hour
- C. A fixed, linear Mastra `Workflow`: `gatherCrmContext → gatherKnowledgeContext → synthesizeBriefing`, explicitly non-agentic/deterministic
- D. A second agentic loop with `maxSteps: 10`

**A12.** How does the solution enforce grounding / prevent hallucination in agent outputs?

- A. Explicit instructions in the agent's system prompt (e.g., "Never fabricate customer facts... say so plainly instead of guessing") combined with tool-based retrieval rather than relying on parametric knowledge
- B. A post-hoc fact-checking model reviews every response before it's returned
- C. All numeric claims are automatically footnoted by a separate service
- D. Output is only ever a fixed template with no free-text generation

**A13.** How are structured outputs (e.g., meeting analysis, executive briefing) enforced?

- A. Via a Zod schema passed as `{ output: schema }` into `.generate()`
- B. Via a separate LLM call that reformats the first response
- C. By asking the model nicely in the prompt to "please respond in JSON"
- D. By parsing free-text output with regex after generation

**A14.** True or false: The backend persists conversation history and reloads it on each turn using Mastra's `Memory` feature.

- A. False — a `conversationId` is generated/echoed back, but it is never persisted or used to reload prior turns; each `.generate()` call is stateless
- B. True, but only for the `CloudPartnershipAgent`
- C. True — every agent call is preceded by a memory lookup
- D. False — memory is stored in Qdrant alongside document embeddings

**A15.** What authentication/authorization exists on the backend's chat endpoint?

- A. JWT-based auth with per-user rate limiting
- B. API-key auth via a NestJS guard
- C. OAuth2 via an external identity provider
- D. None — no guards/middleware were found protecting the endpoint

**A16.** How does the frontend communicate with the backend agent, and does it stream tokens?

- A. WebSocket connection with token-by-token streaming
- B. GraphQL subscription
- C. Server-Sent Events (SSE) streaming the agent's reasoning steps live
- D. Plain REST: `POST /api/chat` with `{message, conversationId}`, awaiting the full JSON response — no streaming

---

## Section B — AI Agent Theory (Agents, Tools, Flows, Agentic Loops, MCP, Prompts, Grounding, RAG)

**B1.** What best defines an "agentic loop" in the context of LLM-based systems?

- A. A caching mechanism that reuses previous LLM responses
- B. A repeating cycle of the model reasoning, choosing a tool/action, observing the result, and reasoning again, continuing until a stopping condition (final answer or step limit) is reached
- C. A `for` loop in application code that calls the LLM API multiple times with the same prompt
- D. A single prompt/response exchange with no external actions

**B2.** In tool-calling agent frameworks, what is the purpose of a "tool" (a.k.a. "function") definition?

- A. It replaces the need for a system prompt
- B. It gives the model a formally-described interface (name, description, input/output schema) so it can request an external action, which the host application executes and returns results for
- C. It's purely cosmetic UI metadata for a chat interface
- D. It is only used for logging purposes and never actually executed

**B3.** What is the Model Context Protocol (MCP)?

- A. A proprietary Anthropic-only prompt format
- B. A database replication protocol
- C. An open protocol standardizing how AI applications connect to external tools, data sources, and systems via a common client-server interface, independent of any single model provider
- D. A method for compressing conversation context to save tokens

**B4.** In MCP terminology, what is the difference between an MCP "tool" and an MCP "resource"?

- A. Tools are model-invoked actions/functions (often with side effects or computation); resources are addressable, typically read-only data/context the client can fetch and expose to the model
- B. Resources always cost money to call; tools are always free
- C. Tools run on the client; resources run on the server
- D. There is no difference — the terms are interchangeable

**B5.** Why might an MCP server use a stateless "Streamable HTTP" transport instead of the stdio transport?

- A. There is no meaningful difference in deployment topology
- B. Streamable HTTP allows a remote, independently-deployable server reachable over the network (e.g., in its own container), whereas stdio requires the server to be a local child process of the client
- C. Stdio is faster but insecure
- D. Streamable HTTP is required by the MCP spec; stdio is deprecated

**B6.** What does "grounding" mean in the context of LLM applications?

- A. Running the model on-premises instead of via API
- B. Fine-tuning the model on a company's data
- C. Constraining/connecting the model's output to verifiable external data (retrieved documents, tool results, structured facts) rather than relying solely on the model's parametric memory, to reduce hallucination
- D. Lowering the model's temperature to 0

**B7.** What is Retrieval-Augmented Generation (RAG)?

- A. A pattern that retrieves relevant external documents/passages (typically via semantic/vector search) and injects them into the prompt context so the model can generate answers grounded in that retrieved content
- B. A method of retraining the model weights on new documents every time a query arrives
- C. A caching layer that returns a stored answer if the same question was asked before
- D. A technique where the model generates multiple candidate answers and votes on the best one

**B8.** In a typical RAG pipeline, what is the role of an embedding model?

- A. It converts text (queries and documents) into dense numeric vectors such that semantically similar text ends up close together in vector space, enabling similarity search
- B. It replaces the need for a vector database
- C. It compresses documents for storage without regard to meaning
- D. It generates the final natural-language answer

**B9.** Why is document "chunking" necessary in RAG systems?

- A. Chunking is a step that happens after generation, not before
- B. Long documents exceed practical embedding/context limits and dilute relevance; splitting into smaller, semantically coherent (often overlapping) chunks improves retrieval precision and lets only relevant pieces be injected into the prompt
- C. Chunking is only needed for images, not text
- D. It is not necessary; whole documents should always be embedded as-is

**B10.** What is a common purpose of overlap between consecutive chunks (e.g., a 30-word overlap between 180-word chunks)?

- A. To make embeddings deterministic
- B. To avoid splitting a relevant idea/sentence awkwardly across a chunk boundary, so context near the edges isn't lost
- C. To increase storage costs intentionally
- D. Overlap has no practical effect and is purely a convention

**B11.** What does a vector database's "distance metric" (e.g., Cosine similarity) determine?

- A. The maximum number of documents that can be stored
- B. How many tools the agent can call per step
- C. How "closeness"/similarity between two embedding vectors is measured/scored during nearest-neighbor search
- D. The physical storage location of the database

**B12.** What is the main risk of NOT grounding an agent that answers questions about live business data (e.g., customer records)?

- A. There is no risk if the system prompt is well-written
- B. Increased latency only
- C. Higher API costs only
- D. The model may hallucinate plausible-sounding but false facts (e.g., invented customer names, numbers, or history) because it has no access to authoritative live data

**B13.** In an agent system prompt, what is the purpose of an explicit "tool-selection policy" (e.g., "use the RAG tool for policy questions, use CRM tools for customer facts, combine both when needed")?

- A. It guides the model's decision-making at each loop step toward choosing the right action, improving reliability and reducing unnecessary or incorrect tool calls
- B. It replaces the need for tool schemas entirely
- C. It is only relevant for multi-agent systems, not single agents
- D. It's decorative and has no measurable effect on behavior

**B14.** What is the benefit of enforcing a structured output schema (e.g., via Zod/JSON Schema) on an LLM's final response?

- A. It eliminates the need for a system prompt
- B. It makes the model's response faster to generate
- C. It guarantees the response conforms to a predictable, machine-parseable shape, making downstream code (UI rendering, further processing) reliable instead of parsing free-form text
- D. It prevents the model from ever making factual errors

**B15.** What distinguishes a deterministic "workflow" (fixed sequence of steps) from an "agentic loop" in orchestration design?

- A. Agentic loops are always faster than workflows
- B. There is no real distinction; the terms are synonyms
- C. A workflow executes a predefined, typically linear/branching sequence of steps regardless of intermediate content; an agentic loop lets the model itself decide, at runtime, which action (if any) to take next and when to stop
- D. Workflows cannot call tools at all, ever

**B16.** Why might a system design deliberately use a plain deterministic workflow (rather than a free-form agentic loop) for a task like "generate an executive briefing from CRM + knowledge-base context"?

- A. Because MCP servers cannot be called from a workflow
- B. Because workflows are cheaper to run in all cases
- C. Because the task's steps and data sources are known in advance, so a fixed pipeline gives more predictable behavior, cost, and latency than letting the model improvise tool calls
- D. Because agentic loops cannot use structured output schemas

**B17.** What is "conversation memory" in the context of an agent framework (e.g., Mastra's `Memory` feature), and why does its absence matter?

- A. It is a synonym for the vector database used in RAG
- B. It refers to GPU memory allocated to the model; its absence only affects performance
- C. It's a mechanism for persisting and reloading prior conversation turns/context across requests; without it, each call is stateless, so the agent has no awareness of earlier turns in the same conversation beyond what the caller resends
- D. It has no relationship to multi-turn conversations

**B18.** Which best describes the difference between an LLM "hallucination" and a "grounded" answer produced via tool use?

- A. A hallucination is a fluent but unverified/fabricated claim generated from the model's internal parameters; a grounded answer is derived from and traceable to retrieved/tool-provided evidence
- B. Hallucinations only occur with small models; large models never hallucinate
- C. There is no difference; both terms describe the same phenomenon
- D. Grounded answers are always shorter than hallucinated ones

**B19.** Why does giving an agent a bounded step limit (e.g., `maxSteps: 5`) matter operationally?

- A. It caps latency/cost and prevents runaway loops where the model repeatedly calls tools without converging on an answer
- B. It determines how many tools the agent has access to
- C. It is required by the MCP specification
- D. It has no operational purpose, it is just a default value

**B20.** In multi-tool agents, why is providing an explicit input/output schema (e.g., via Zod) for each tool important, beyond documentation?

- A. It has no functional effect, it's purely for developers reading the code
- B. It automatically improves the underlying LLM's reasoning ability
- C. It is only used to generate API documentation websites
- D. It lets the framework validate/coerce the model's tool-call arguments and the tool's return value at runtime, catching malformed calls before they reach business logic

---

## Section C — NestJS Backend Implementation

**C1.** What decorator and route prefix does the chat endpoint use?

- A. `@Controller("chat")` with a `@Get()` handler
- B. No controller — the chat route is defined directly in `main.ts`
- C. `@Controller("api/chat")` with a single `@Post()` handler calling `mastraService.chat(...)`
- D. `@Controller("api/agents")` with `@Post("chat")`

**C2.** How is file upload handled in `DocumentController`?

- A. `@Body()` alone is used to receive the raw file buffer
- B. `@Post("upload")` combined with `@UseInterceptors(FileInterceptor("file"))` and a `@UploadedFile()` parameter, throwing `BadRequestException` if no file is present
- C. Files are uploaded directly to Qdrant via a gRPC stream
- D. A raw Express middleware parses `multipart/form-data` manually

**C3.** Which NestJS module wires up file-upload size limits, and how?

- A. `VectorModule`, via a Qdrant collection quota
- B. It's hardcoded in `main.ts` as an Express body-parser limit
- C. `DocumentsModule`, via `MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } })`
- D. `AgentsModule`, via a custom `FileSizeGuard`

**C4.** How are Mongoose schemas defined and registered for `Customer`, `Document`, and `Meeting` entities?

- A. Using plain Mongoose `Schema` objects with no decorators, registered in `app.module.ts` only
- B. Using GraphQL type definitions that NestJS auto-converts to Mongoose schemas
- C. Using `@Schema()`/`@Prop()` decorators to define entity classes, then `SchemaFactory.createForClass(Entity)`, registered per-feature-module via `MongooseModule.forFeature([...])`
- D. Schemas are defined directly inside the controllers

**C5.** Where is the MongoDB connection itself established, and how?

- A. In each feature module independently via `MongooseModule.forRoot()`
- B. In `AppModule`, via `MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: ... })`
- C. MongoDB connects lazily on first query with no explicit setup
- D. In `main.ts`, via a manual `mongoose.connect()` call before `NestFactory.create()`

**C6.** How is configuration (`port`, `mongoUrl`, `qdrant`, `llm`, etc.) loaded and made available across the app?

- A. Via `registerAs()` namespaced configs only, with no global module
- B. Via a plain factory function in `configuration.ts` passed to `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })`, then consumed everywhere via injected `ConfigService.get<T>("key.path")`
- C. Via a JSON file read synchronously in each module's constructor
- D. Via `process.env` accessed directly in every service

**C7.** What request validation is actually applied to the `/api/chat` endpoint's request body?

- A. No validation at all — the body is passed straight to the agent
- B. A custom `PipeTransform` that manually checks `typeof body.message === "string"`
- C. A `ChatRequestDto` class using `class-validator` decorators (`@IsString()`, `@MinLength(1)` on `message`; `@IsOptional() @IsString()` on `conversationId`), enforced by a global `ValidationPipe`
- D. A Zod schema, matching the tool-output validation style used elsewhere

**C8.** Where and how is the global `ValidationPipe` registered, and with what options?

- A. Per-controller via `@UsePipes(new ValidationPipe())` on each controller
- B. In `main.ts`, via `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`
- C. Inside `ChatRequestDto` itself via a class decorator
- D. It isn't registered globally; only `AgentsModule` applies it

**C9.** True or false: Zod schemas (as seen in `mastra.service.ts` for structured LLM output) and `class-validator` DTOs (as seen in `ChatRequestDto`) serve the same layer of the application.

- A. False — `class-validator`/`ValidationPipe` validates incoming HTTP request bodies at the controller boundary, while Zod schemas constrain/validate LLM tool-call arguments and structured generation output, a different boundary entirely
- B. True — Zod replaced class-validator everywhere in this codebase
- C. True — both validate incoming HTTP request bodies
- D. False — Zod is only used in the frontend, never the backend

**C10.** How does the codebase handle cross-cutting error handling for LLM-related failures (e.g., missing/invalid API keys)?

- A. A global exception filter, `LlmErrorFilter`, decorated with `@Catch()` (catch-all) and registered via `app.useGlobalFilters(new LlmErrorFilter())` in `main.ts`; it passes through existing `HttpException`s and maps API-key-related error messages to a `503 SERVICE_UNAVAILABLE`
- B. A NestJS Guard that blocks requests if the API key is missing
- C. A try/catch block duplicated in every controller method
- D. An interceptor that retries failed LLM calls up to 3 times automatically

**C11.** Are there any custom NestJS Guards (`CanActivate`) or Pipes (`PipeTransform`) in this codebase, besides the global `ValidationPipe`?

- A. Yes — an `AuthGuard` protects all `/api` routes
- B. No — no custom Guards or Pipes exist anywhere in the repo; the only pipe in use is the built-in global `ValidationPipe`
- C. Yes — a `ParseObjectIdPipe` validates all Mongo ObjectId route params
- D. Yes — a custom `RoleGuard` restricts CRM tool access

**C12.** How is CORS configured for the backend?

- A. Via `app.enableCors({ origin: config.get("corsOrigin"), credentials: true })` in `main.ts`
- B. Via a NestJS `@Cors()` decorator on `AppModule`
- C. It isn't configured — CORS is fully open by default
- D. Via a third-party `cors` Express middleware registered manually

**C13.** Which modules does `AgentsModule` import, and why?

- A. `CustomersModule` and `TranscriptionModule`, to directly query Mongo itself
- B. `VectorModule` and `McpModule`, because `MastraService` needs the RAG vector search and the MCP client to build the `CloudPartnershipAgent`'s tools
- C. None — it's fully self-contained
- D. Only `McpModule`; RAG is handled inside `AgentsModule` itself

**C14.** How does `WorkflowsController`'s action-decision endpoint validate the incoming decision value?

- A. It isn't validated; any string is accepted and stored as-is
- B. Via a dedicated DTO with a `class-validator` `@IsIn(["approve", "reject"])` decorator
- C. Via a Zod schema shared with the LLM tool definitions
- D. Inline in the controller/service logic, throwing a `BadRequestException` if the decision value isn't recognized — no dedicated DTO/class-validator is used for this route

**C15.** What dependency-injection pattern is used to give services access to their Mongoose models?

- A. `@Inject("CUSTOM_TOKEN")` with manually registered custom providers
- B. Property injection via `@Autowired`-style decorators
- C. A singleton `DatabaseManager` class instantiated manually in each service
- D. `@InjectModel(Entity.name)` constructor-parameter decorators (e.g. in `DocumentService`, `CustomerService`, `TranscriptionService`)

---

## Section D — React Frontend Implementation

**D1.** Which data-fetching library powers all server-state management in the frontend, and where is its client configured?

- A. SWR, configured in `App.tsx`
- B. Axios interceptors with a custom in-memory cache
- C. `@tanstack/react-query`, with `QueryClient` instantiated in `main.tsx` (`defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } }`) and `QueryClientProvider` wrapping the app
- D. Apollo Client, configured for a GraphQL backend

**D2.** How does the frontend make HTTP calls to the backend — what does `src/api/client.ts` use?

- A. Axios, with a shared instance and interceptors for error handling
- B. Native `fetch`, via a generic `request<T>(path, init)` helper that prefixes calls with `/api` and throws an `Error` on non-OK responses
- C. `XMLHttpRequest` wrapped in a custom promise utility
- D. GraphQL queries sent over a WebSocket

**D3.** Which `useQuery` call is configured with `enabled: !!selected`, and why?

- A. The `["documents"]` query, to avoid re-fetching after upload
- B. The `["meetings", selected]` query in `CustomersPage`, so it only runs once a customer is selected
- C. The `["actions"]` query, to avoid polling before the workflow page loads
- D. The `["customers"]` query, to avoid fetching until the page mounts

**D4.** After a successful document upload mutation, how does the UI refresh the document list?

- A. A `useEffect` polls the documents endpoint every 5 seconds
- B. It doesn't — the user must manually reload the page
- C. `window.location.reload()` is called inside the mutation
- D. The `onSuccess` callback calls `queryClient.invalidateQueries({ queryKey: ["documents"] })`, prompting React Query to refetch the `["documents"]` query

**D5.** How many distinct `useMutation` calls exist in the frontend, and what do they cover?

- A. Six — including login and logout mutations
- B. Four — sending a chat message, uploading a document, generating an executive briefing, and approving/rejecting a recommended action
- C. Two — chat send and document upload only
- D. One — only the chat send action

**D6.** Does the chat-sending mutation invalidate any React Query cache entries on success?

- A. Yes, it invalidates `["customers"]` since chat can reference customer data
- B. Yes, it invalidates all active queries globally
- C. Yes, it invalidates `["chat"]`
- D. No — its `onSuccess` handler updates local component state (`conversationId.current`, appended assistant message, `activeResponse`) rather than calling `invalidateQueries`

**D7.** How is the chat conversation ID tracked across messages within `ChatPage`?

- A. In global state via a Context Provider
- B. In `localStorage`, read on every render
- C. In a `useRef<string | undefined>`, not `useState`, since updating it should not trigger a re-render on its own
- D. In the URL as a route param via `react-router-dom`

**D8.** Does this codebase use `useEffect` anywhere (e.g., to auto-scroll the chat panel)?

- A. Yes, extensively, for scrolling, polling, and subscriptions
- B. Yes, in `main.tsx` to initialize the query client
- C. Yes, but only in `AgentActivityPanel.tsx`
- D. No — `useEffect` is not used anywhere in the frontend; for example, chat scrolling relies on plain CSS (`overflow-y-auto`) rather than a scroll-effect hook

**D9.** What global state management approach (Redux, Zustand, Context API) does this frontend use?

- A. Redux Toolkit, with a single root store
- B. Zustand, with one store per page
- C. The Context API, with a single `AppStateContext`
- D. None of those — there is no `React.createContext`/`useContext`, no Redux, no Zustand; all local UI state uses `useState`, and all server state lives in React Query's cache

**D10.** How does the frontend implement client-side routing, and what routes exist?

- A. `react-router-dom`'s `BrowserRouter`/`Routes`, with routes `/` (ChatPage), `/customers` (CustomersPage), `/documents` (DocumentsPage), and `/workflows` (WorkflowsPage)
- B. Next.js file-based routing
- C. Manual state-based tab switching, no router library
- D. Hash-based routing implemented manually with `window.location.hash`

**D11.** What styling approach does the frontend use?

- A. Styled-components (CSS-in-JS)
- B. Tailwind CSS utility classes with a custom `brand` color, no component library like MUI/shadcn
- C. Plain hand-written CSS files per component, no utility framework
- D. Material UI (MUI) component library

**D12.** Are there any custom React hooks (files whose name starts with `use`) in this codebase?

- A. No — no custom hooks exist; `useQuery`/`useMutation`/`useState`/`useRef` are called directly inside page components
- B. Yes — `useChat`, `useCustomers`, and `useDocuments` custom hooks wrap the React Query calls
- C. Yes — a single `useApi` hook wraps the `fetch` client
- D. Yes — `useAgentActivity` centralizes the activity-panel logic

**D13.** How are shared TypeScript types (e.g., `ChatResponse`, `Customer`, `RecommendedAction`) organized?

- A. Defined as Zod schemas shared directly with the backend
- B. Auto-generated from the NestJS DTOs via a codegen step
- C. Duplicated inline in every component that needs them
- D. Centralized in a single `src/types.ts` file, imported wherever needed (e.g., by `api/client.ts` and page components)

**D14.** How does `AgentActivityPanel.tsx` receive the data it renders (`steps`, `toolCalls`, `sources`)?

- A. Via `useContext`, reading from a shared `ChatContext`
- B. Via a `useEffect` that subscribes to a WebSocket stream
- C. Purely via props — it's a presentational component with no hooks of its own, rendering fields passed down from the parent's `ChatResponse` state
- D. It calls its own `useQuery` to fetch the latest chat response independently

**D15.** How is the document-upload file input handled after a successful upload?

- A. `useState` holds the `File` object and is reset via a `useEffect` cleanup function
- B. The page fully remounts via a `key` prop change
- C. The mutation's `onSuccess` clears the file input using a ref, alongside invalidating the `["documents"]` query
- D. The file input is uncontrolled and never reset; the user must refresh manually

---

## Section E — MCP Server: Implementation & Protocol Theory

**E1.** Which SDK class is instantiated to build the CRM MCP server, and with what identifying metadata?

- A. `Server` (low-level class) with no name/version metadata
- B. `FastMCP`, a third-party wrapper library
- C. `McpHost`, configured with a list of downstream servers
- D. `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`, constructed as `new McpServer({ name: "crm-mcp-server", version: "1.0.0" })`

**E2.** How is each tool registered on the server, and how is its input schema expressed?

- A. Via decorators (`@Tool()`) on a controller-style class
- B. Via a JSON Schema file loaded from disk for each tool
- C. Via `server.tool()` with a full `z.object({...})` wrapper for every input schema
- D. Via `server.registerTool(name, { title, description, inputSchema }, handler)`, where `inputSchema` is a plain object map of individual Zod field schemas (e.g. `{ customerId: z.string().describe(...) }`), not a wrapped `z.object`

**E3.** What shape does a tool handler return to comply with the MCP tool-result format?

- A. `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }` — an explicit `content` array with a `"text"` block containing the JSON-stringified result
- B. A raw JavaScript object, serialized automatically by the SDK
- C. A GraphQL-style `{ data, errors }` envelope
- D. An HTTP response with `Content-Type: application/json` and the result as the body

**E4.** Which HTTP routes does the MCP server's Express app actually expose?

- A. `GET /health` and `POST /mcp` only — no `GET /mcp` or `DELETE /mcp` routes exist
- B. Full CRUD-style routes: `GET/POST/PUT/DELETE /mcp`
- C. Only `POST /mcp`; there is no health-check endpoint
- D. `GET /mcp/tools`, `POST /mcp/call`, and `GET /health`

**E5.** Why does `POST /mcp` construct a brand-new `McpServer` + `StreamableHTTPServerTransport` instance for every single incoming request?

- A. It's a bug — instances should be reused for performance
- B. The code deliberately implements a stateless endpoint (`sessionIdGenerator: undefined`) so no session affinity is needed behind a load balancer, at the cost of not supporting server-initiated push between separate calls — each new instance is cleaned up via `res.on("close", ...)` to avoid leaks
- C. The MCP specification requires a new server instance per request
- D. It's required because MongoDB connections cannot be reused across requests

**E6.** Where is the only place in this codebase where a raw JSON-RPC 2.0 structure is explicitly hand-constructed (rather than left to the SDK)?

- A. In the `initialize` handshake handler
- B. In `mcp-client.service.ts`'s `callTool` method
- C. In `seed.ts`, when logging seed progress
- D. In the `POST /mcp` catch-all error handler, which manually responds with `{ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }` if headers haven't been sent yet

**E7.** How does the `getCustomer` tool handle a customer ID that doesn't exist in MongoDB?

- A. It returns a normal (non-error) tool result whose JSON payload is `{ error: 'No customer found with id "..."' }`, rather than throwing
- B. It returns `null` with no explanation
- C. It falls back to returning a default placeholder customer record
- D. It throws an exception, which propagates as an MCP tool-call error

**E8.** How does `getMigrationOpportunities` select and shape its results?

- A. A full-text search index query on free-text notes
- B. A plain `find({ tags: { $in: ["migration-candidate", "at-risk"] } })` sorted by `monthlySpendUsd` descending, with `opportunities`/`challenges` arrays trimmed to their top 2 entries via `.slice(0, 2)`
- C. It queries every customer and filters in application code with no MongoDB-level filtering at all
- D. A MongoDB aggregation pipeline with `$lookup` joins across three collections

**E9.** How does `getCustomerCloudUsage` compute annualized spend?

- A. It doesn't compute annualized spend; only monthly spend is ever returned
- B. By simple arithmetic on the stored monthly figure: `annualizedSpendUsd: customer.monthlySpendUsd * 12`
- C. By summing 12 months of historical invoice records from a separate `invoices` collection
- D. By calling out to an external billing API in real time

**E10.** When and how does the CRM database get seeded with `customers.json`/`meetings.json`?

- A. Manually, by an operator running `npm run seed` after deployment
- B. Automatically, but only the first time the container ever starts (a one-time init flag)
- C. Seeding happens lazily on the first tool call that queries an empty collection
- D. Automatically on every container start — the Dockerfile's CMD runs `node dist/seed.js && node dist/server.js`, and the seed script is explicitly idempotent (`deleteMany({})` then `insertMany`, plus unique indexes on `customerId`/`meetingId`)

**E11.** How does `mcp-client.service.ts` construct its `Client` instance, and what capabilities does it declare?

- A. `new Client({ capabilities: { tools: {}, resources: {}, prompts: {} } })`, declaring support for all three primitives
- B. `new Client()` with a required `apiKey` parameter for authentication
- C. A capabilities object requesting `sampling` support, since the backend needs the MCP server to call back into the LLM
- D. `new Client({ name: "connact-backend", version: "1.0.0" })` with no explicit `capabilities` object passed

**E12.** What happens when the MCP client's `connect()` call fails (e.g., server unreachable)?

- A. It automatically retries every second indefinitely until successful
- B. It falls back to a cached, in-memory mock of the CRM tools
- C. It catches the error, sets an internal `connected` flag to `false`, and logs a warning — it does not throw or retry with backoff at that point
- D. It throws immediately, crashing the NestJS application on startup

**E13.** How does the backend recover from a dropped MCP connection on a later tool call?

- A. It relies on the MCP SDK's built-in exponential-backoff reconnection, configured via a `retryPolicy` option
- B. It doesn't — once disconnected, the backend must be restarted
- C. A `setInterval` polls the MCP server's `/health` endpoint every 5 seconds and reconnects automatically
- D. `ensureConnected()` is called at the top of both `listTools()` and `callTool()`; if `connected` is currently `false`, it lazily re-invokes `connect()` on demand — there's no background timer or scheduled retry loop

**E14.** How does `mcp-client.service.ts` extract a usable JavaScript value from a tool-call result?

- A. It assumes `result.content[0].json` is already a parsed object and uses it directly
- B. It scans `result.content` for the first entry with `type === "text"`, then `JSON.parse`s its `text` field — falling back to the raw string if parsing fails, or `null` if no text part exists at all
- C. It deserializes a Protocol Buffers payload embedded in the response
- D. It requires every tool to return `type: "json"` content blocks specifically

**E15.** What authentication or authorization does the MCP server itself enforce on its `/mcp` and `/health` endpoints?

- A. mTLS between the backend and the MCP server
- B. Basic auth credentials passed via the `MONGO_URL` environment variable
- C. None — no auth-related code (API keys, bearer tokens, etc.) exists anywhere in the MCP server; both endpoints are fully open
- D. A shared-secret header (`X-MCP-Token`) validated on every request

**E16.** Besides tools, does this MCP server implement any of the other standard MCP primitives (resources, prompts, sampling)?

- A. Yes — it also registers several resources for read-only CRM data browsing
- B. No — only `registerTool` is used; there is no `registerResource`, `registerPrompt`, or sampling-related code anywhere in the server
- C. Yes — it supports sampling so the MCP server can request completions from the client's LLM
- D. Yes — it implements prompts so the model can request pre-written prompt templates

**E17.** In the general MCP architecture, what is the purpose of the `initialize` handshake and capability negotiation between client and server (even though it's fully hidden by the SDK in this codebase)?

- A. It negotiates the embedding model to be used for any RAG-related tools
- B. It lets the client and server agree on protocol version and advertise which primitives/features (tools, resources, prompts, sampling, etc.) each side supports, before any tool calls are attempted
- C. It's a legacy step with no functional purpose in modern MCP implementations
- D. It exchanges billing credentials before any tool can be called

**E18.** How does the docker-compose setup ensure the backend doesn't start using the MCP server before it's actually ready?

- A. There is no readiness coordination; the backend simply crashes and Docker restarts it until the MCP server happens to be up
- B. A fixed `sleep 10` command is added to the backend's startup script
- C. The backend polls `CRM_MCP_SERVER_URL` in a retry loop with exponential backoff before calling `NestFactory.create`
- D. The MCP server defines a healthcheck (`node -e "fetch('http://localhost:4100/health')..."`), and the `backend` service declares `depends_on: crm-mcp-server: condition: service_healthy`

---

## Answer Key & Explanations

### Section A — Solution Design & Implementation

| # | Answer | Explanation |
|---|--------|-------------|
| A1 | **D** | `mastra.service.ts:118` calls `this.cloudPartnershipAgent.generate(message, { maxSteps: 5 })`, the sole agentic-loop entry point in the codebase. |
| A2 | **A** | `maxSteps: 5` caps the internal decide→act→observe cycle at 5 iterations before the model must return a final answer. |
| A3 | **D** | `mastra.service.ts:71-76` wires `tools: { searchKnowledgeBase, ...crmTools }` — a RAG tool plus 5 CRM tools defined in `crm.tools.ts:11-48`. |
| A4 | **C** | CRM tools call `mcp-client.service.ts`'s `callTool()`, which talks to the standalone `mcp-server` over HTTP; that server queries MongoDB (`mcp-server/src/tools.ts:10-97`). |
| A5 | **A** | Both sides use `StreamableHTTPServerTransport`/`StreamableHTTPClientTransport`, statelessly (`sessionIdGenerator: undefined`, fresh server+transport per POST). |
| A6 | **B** | `embedding.service.ts` uses local Transformers.js `Xenova/all-MiniLM-L6-v2` (384-dim, mean pooling, normalized); `vector.service.ts` stores vectors in Qdrant collection `connact_knowledge` with Cosine distance. |
| A7 | **D** | `common/chunking.ts:12-13` implements a sliding word-count window: 180 words per chunk with 30-word overlap — no tokenizer awareness. |
| A8 | **C** | `DocumentService.onModuleInit` (`document.service.ts:50-87`) auto-bootstraps ingestion only when the collection's document count is zero; there is no manual ingestion CLI for knowledge-docs. |
| A9 | **C** | `common/llm.ts:9-15` uses `@ai-sdk/anthropic`'s `createAnthropic`, model id from env `ANTHROPIC_MODEL`, defaulting to `claude-sonnet-5`. |
| A10 | **A** | Both agents call `.generate()` without tools or `maxSteps`, making them single-shot structured-output generations rather than agentic loops. |
| A11 | **C** | `executive-briefing.workflow.ts` builds a Mastra `Workflow` chaining `gatherCrmContext → gatherKnowledgeContext → synthesizeBriefing` via `.then()...commit()` — an explicitly deterministic, non-agentic pipeline (per the file's own comments). |
| A12 | **A** | The agent's system prompt (`agent.config.ts`) explicitly instructs it not to fabricate customer facts and to admit uncertainty, while relying on tool-retrieved data rather than the model's own memory. |
| A13 | **A** | Structured outputs use Zod schemas (`meetingAnalysisOutputSchema`, `executiveBriefingOutputSchema`) passed as `{ output: schema }` into `.generate()`, not prompt-only requests or post-hoc parsing. |
| A14 | **A** | `mastra.service.ts` generates/echoes a `conversationId` but never persists or reloads history; no Mastra `Memory` feature is wired in — each call is stateless (explicitly noted as a TODO in comments). |
| A15 | **D** | No guards, middleware, or auth mechanism was found protecting `POST /api/chat` or any other backend route. |
| A16 | **D** | `frontend/src/api/client.ts` performs a plain `fetch` `POST /api/chat` with `{message, conversationId}` and awaits the full JSON response — no WebSocket/SSE streaming is implemented. |

### Section B — AI Agent Theory

| # | Answer | Explanation |
|---|--------|-------------|
| B1 | **B** | The defining feature of an agentic loop is the model's own reasoning driving repeated tool use until it decides it's done (or a limit is hit) — not merely calling an API in a loop from outside code. |
| B2 | **B** | A tool definition exposes a callable capability to the model with a schema so the model can request it and the host can execute it and feed results back. |
| B3 | **C** | MCP is an open, model-agnostic protocol for connecting AI applications to tools/data sources via a standard client-server architecture. |
| B4 | **A** | Tools are actions the model can invoke (may have side effects); resources are addressable data the client can retrieve and supply as context — a distinct primitive in MCP's spec. |
| B5 | **B** | Stateless Streamable HTTP lets the MCP server run as an independent, network-reachable service (its own container/host), unlike stdio which ties the server to a local child process. |
| B6 | **C** | Grounding means tethering output to verifiable external facts/data instead of trusting the model's internal (parametric) knowledge alone, which reduces hallucination risk. |
| B7 | **A** | RAG retrieves relevant passages (typically via vector similarity search) and injects them into the prompt so generation is grounded in that retrieved content. |
| B8 | **A** | Embedding models map text to vectors positioned by semantic similarity, which is what enables nearest-neighbor retrieval in a vector store. |
| B9 | **B** | Chunking keeps pieces small and topically coherent so retrieval returns focused, relevant context instead of noisy, oversized documents. |
| B10 | **B** | Overlap prevents a relevant sentence/idea from being cut in half at a chunk boundary, preserving local context. |
| B11 | **C** | A distance/similarity metric (e.g., cosine) defines how "close" two vectors are considered, which directly determines search ranking/results. |
| B12 | **D** | Without grounding, a model answering about live/dynamic business data has nothing but its stale/generic training data to draw on, inviting fabricated specifics. |
| B13 | **A** | An explicit tool-selection policy in the system prompt shapes the model's per-step decisions, improving reliability of the agentic loop's action choices. |
| B14 | **C** | Schema-enforced structured output guarantees a predictable shape for downstream consumption (UI, further logic), rather than relying on fragile text parsing. |
| B15 | **C** | The core distinction is *who decides the next step*: a workflow's sequence is fixed by the developer; an agentic loop's sequence is decided dynamically by the model at runtime. |
| B16 | **C** | When the required steps and data sources are already known and fixed, a deterministic workflow gives more predictable cost/latency/behavior than letting a model improvise via an agentic loop. |
| B17 | **C** | Conversation memory persists/reloads prior turns across requests; its absence means every call is self-contained and the agent "forgets" earlier turns unless the caller resupplies them. |
| B18 | **A** | Hallucination = fluent but unverified/fabricated model output from parametric memory; grounded answer = traceable to actual retrieved/tool-sourced evidence. |
| B19 | **A** | A step cap bounds worst-case latency/cost and guards against a model looping indefinitely without producing a final answer. |
| B20 | **D** | Tool schemas allow the framework to validate/coerce arguments and return values at runtime, catching malformed model output before it reaches application logic — a functional (not just documentation) benefit. |

### Section C — NestJS Backend Implementation

| # | Answer | Explanation |
|---|--------|-------------|
| C1 | **C** | `agents.controller.ts:13` uses `@Controller("api/chat")` with one `@Post()` handler calling `mastraService.chat(...)`. |
| C2 | **B** | `document.controller.ts:19-25` combines `@Post("upload")`, `@UseInterceptors(FileInterceptor("file"))`, and `@UploadedFile()`, throwing `BadRequestException` when no file is supplied. |
| C3 | **C** | `documents.module.ts:9-19` registers `MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } })` alongside the Mongoose feature and `VectorModule`. |
| C4 | **C** | Entities like `CustomerEntity`/`DocumentEntity`/`MeetingEntity` use `@Schema()`/`@Prop()`, are turned into schemas via `SchemaFactory.createForClass`, and registered per-module with `MongooseModule.forFeature([...])`. |
| C5 | **B** | The actual DB connection is established once, in `app.module.ts:16-19`, via `MongooseModule.forRootAsync({ inject: [ConfigService], useFactory })` — feature modules only register schemas, not connections. |
| C6 | **B** | `configuration.ts:9-29` is a plain factory (not `registerAs`) loaded via `ConfigModule.forRoot({ isGlobal: true, load: [configuration] })`; every service reads values with injected `ConfigService.get<T>("key.path")`. |
| C7 | **C** | `ChatRequestDto` (`agents/dto/chat.dto.ts`) applies `class-validator` decorators, and the global `ValidationPipe` (registered in `main.ts`) enforces them — Zod is not used for this HTTP boundary. |
| C8 | **B** | `main.ts:13` calls `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`, applying to every route, not per-controller. |
| C9 | **A** | `class-validator`/`ValidationPipe` guards the HTTP request-body boundary; Zod schemas in `mastra.service.ts` constrain a completely different boundary — LLM tool arguments/structured output. The two don't overlap. |
| C10 | **A** | `LlmErrorFilter` (`common/filters/llm-error.filter.ts:14`) is a catch-all `@Catch()` filter registered globally via `app.useGlobalFilters(new LlmErrorFilter())` in `main.ts:14`; it re-throws existing `HttpException`s and maps API-key error text to `503`. |
| C11 | **B** | No `CanActivate` guards or custom `PipeTransform` pipes exist in the repo; the only pipe at work is the built-in global `ValidationPipe`. |
| C12 | **A** | `main.ts:12` configures `app.enableCors({ origin: config.get("corsOrigin"), credentials: true })` — there's no separate Express `cors` middleware or decorator. |
| C13 | **B** | `agents.module.ts:14-20` imports `[VectorModule, McpModule]` because `MastraService` needs RAG search and the MCP client to assemble the `CloudPartnershipAgent`'s tool set. |
| C14 | **D** | `WorkflowsController`/`WorkflowsService` validate the decision value inline, throwing `BadRequestException` for unrecognized values — there's no dedicated DTO or `class-validator` rule for this route. |
| C15 | **D** | Services like `DocumentService`, `CustomerService`, and `TranscriptionService` receive their Mongoose models via `@InjectModel(Entity.name)` constructor parameters — no custom DI tokens are used. |

### Section D — React Frontend Implementation

| # | Answer | Explanation |
|---|--------|-------------|
| D1 | **C** | `@tanstack/react-query` (`package.json`) is the sole data-fetching layer; `QueryClient` is created in `main.tsx` with `{ retry: 1, refetchOnWindowFocus: false }` and provided via `QueryClientProvider`. |
| D2 | **B** | `src/api/client.ts` uses native `fetch` through a generic `request<T>(path, init)` helper that prefixes `/api` and throws an `Error` on non-OK responses — no axios anywhere. |
| D3 | **B** | `CustomersPage.tsx:9-13`'s `["meetings", selected]` query passes `enabled: !!selected`, so it only fires once a customer is actually selected. |
| D4 | **D** | The upload mutation's `onSuccess` (`DocumentsPage.tsx:23-29`) calls `queryClient.invalidateQueries({ queryKey: ["documents"] })`, triggering an automatic refetch. |
| D5 | **B** | Four mutations exist: chat send (`ChatPage.tsx`), document upload (`DocumentsPage.tsx`), executive briefing generation, and action approve/reject (both in `WorkflowsPage.tsx`) — there is no auth flow in this app. |
| D6 | **D** | The chat mutation's `onSuccess` updates local state (`conversationId.current`, appended message, `activeResponse`) — it never calls `invalidateQueries`, since chat isn't backed by a cached query. |
| D7 | **C** | `ChatPage.tsx:20` stores `conversationId` in a `useRef`, deliberately avoiding `useState` since changing it shouldn't force a re-render on its own. |
| D8 | **D** | `useEffect` is not used anywhere in the frontend; chat scrolling relies on CSS `overflow-y-auto` rather than a scroll-effect hook. |
| D9 | **D** | There's no Context API, Redux, or Zustand usage — local UI state is plain `useState`, and all server state is cached by React Query. |
| D10 | **A** | `react-router-dom`'s `BrowserRouter`/`Routes` (wired in `main.tsx`/`App.tsx`) define `/`, `/customers`, `/documents`, and `/workflows`. |
| D11 | **B** | Styling is Tailwind CSS utility classes with a custom `brand` color — no MUI, shadcn, or styled-components dependency exists. |
| D12 | **A** | No files with a `use*` custom-hook naming pattern exist; every page calls `useQuery`/`useMutation`/`useState`/`useRef` directly. |
| D13 | **D** | All shared interfaces (`ChatResponse`, `Customer`, `RecommendedAction`, etc.) live in one `src/types.ts`, imported by both the API client and page components. |
| D14 | **C** | `AgentActivityPanel.tsx` is purely presentational — no hooks — rendering `steps`/`toolCalls`/`sources` passed down as props from the parent's `ChatResponse` state. |
| D15 | **C** | The upload mutation's `onSuccess` clears the file input via a ref and invalidates `["documents"]` in the same callback — no full remount or page reload is involved. |

### Section E — MCP Server: Implementation & Protocol Theory

| # | Answer | Explanation |
|---|--------|-------------|
| E1 | **D** | `mcp-server/src/server.ts` imports `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` and constructs it as `new McpServer({ name: "crm-mcp-server", version: "1.0.0" })`. |
| E2 | **D** | Each tool uses `server.registerTool(name, { title, description, inputSchema }, handler)`, with `inputSchema` as a plain object of individual Zod field schemas (e.g. `{ customerId: z.string().describe(...) }`) rather than a `z.object({...})` wrapper; no-arg tools pass `inputSchema: {}`. |
| E3 | **A** | Every handler returns `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`, matching the MCP tool-result content-block format. |
| E4 | **A** | The Express app defines only `GET /health` and `POST /mcp` — there's no `GET /mcp` (for SSE resumption) or `DELETE /mcp` (session termination) route. |
| E5 | **B** | The code's own comment explains this is a deliberately stateless endpoint (`sessionIdGenerator: undefined`) avoiding the need for session affinity behind a load balancer, trading away server-initiated push between calls; `res.on("close", ...)` closes both instances to prevent leaks. |
| E6 | **D** | The `POST /mcp` catch-all handler is the only place a raw `{ jsonrpc: "2.0", error: {...}, id: null }` envelope is hand-constructed — everywhere else, JSON-RPC framing is hidden inside the SDK. |
| E7 | **A** | `getCustomer` returns a normal tool result whose JSON payload is `{ error: 'No customer found with id "..."' }` when the MongoDB `findOne` misses — it does not throw. |
| E8 | **B** | `getMigrationOpportunities` runs a plain `find({ tags: { $in: ["migration-candidate", "at-risk"] } })` sorted by `monthlySpendUsd` descending, then trims `opportunities`/`challenges` to their top 2 via `.slice(0, 2)` — no aggregation pipeline is used. |
| E9 | **B** | `getCustomerCloudUsage` simply multiplies: `annualizedSpendUsd: customer.monthlySpendUsd * 12` — no separate invoice history or external billing call. |
| E10 | **D** | The Dockerfile's `CMD` runs `node dist/seed.js && node dist/server.js`, so seeding happens on every container start; `seed.ts` is explicitly commented as idempotent (`deleteMany({})` then `insertMany`, with unique indexes on `customerId`/`meetingId`). |
| E11 | **D** | `mcp-client.service.ts` constructs `new Client({ name: "connact-backend", version: "1.0.0" })` with no explicit `capabilities` object passed at all. |
| E12 | **C** | `connect()` catches connection errors, sets `connected = false`, and logs a warning — it does not throw (so Nest startup doesn't crash) and does not retry with backoff at that moment. |
| E13 | **D** | `ensureConnected()` runs at the start of both `listTools()` and `callTool()`, lazily calling `connect()` again only if `connected` is currently `false` — there's no timer-based or scheduled reconnect loop. |
| E14 | **B** | `callTool` scans `result.content` for the first `type === "text"` entry and `JSON.parse`s its `text`, falling back to the raw string on a parse failure or to `null` if no text part exists. |
| E15 | **C** | No authentication code (API keys, bearer tokens, shared secrets) exists anywhere in `mcp-server/` — `/mcp` and `/health` are both fully open endpoints. |
| E16 | **B** | Only `registerTool` is called (5 times); there is no `registerResource`, `registerPrompt`, or sampling-related code anywhere in `server.ts`. |
| E17 | **B** | The `initialize` handshake is how an MCP client and server negotiate protocol version and advertise which primitives/features each side supports, before any tool calls occur — a foundational MCP concept, even though this SDK hides its wire-level detail. |
| E18 | **D** | The `crm-mcp-server` service defines a `healthcheck` that curls `/health`; the `backend` service's `depends_on: crm-mcp-server: condition: service_healthy` ensures Docker won't start the backend until that check passes. |

