---
title: "NestJS Cheat Sheet — CONNACT-MASTRA-AGENTS-MCP Backend"
---

# NestJS Cheat Sheet

Grounded in the actual `backend/` codebase — every example is real, with file references.

---

## 1. Module → Controller → Service — what sits between a module and its routes?

A module never defines routes itself. It's a **registration/wiring unit**. The chain is:

```
Module (registers)  →  Controller (declares routes via decorators)  →  Service (does the work)
```

```ts
// workflows.module.ts
@Module({
  imports: [McpModule, VectorModule, AgentsModule],
  controllers: [WorkflowsController],   // ← gets HTTP routes registered
  providers: [WorkflowsService],        // ← becomes injectable within this module's scope
})
export class WorkflowsModule {}
```

| Layer | Job | Example |
|---|---|---|
| `@Module()` | DI/registration graph | `WorkflowsModule` |
| `@Controller(prefix)` | HTTP surface (routes) | `@Controller("api/workflows")` |
| `@Injectable()` service | Business logic | `WorkflowsService` |

At bootstrap, Nest scans every controller in the import graph and registers its routes on the underlying HTTP adapter (Express, via `@nestjs/platform-express`). Controllers get their services via constructor injection — Nest's DI container is what actually sits "between" the module registration and the running route.

---

## 2. Why `AppModule` must import every feature module

**Nest does zero auto-discovery.** Nothing exists at runtime unless it's reachable from the root module's `imports` graph.

```ts
// app.module.ts
imports: [
  ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
  MongooseModule.forRootAsync({ ... }),
  VectorModule, McpModule, DocumentsModule, CustomersModule,
  AgentsModule, TranscriptionModule, WorkflowsModule,
],
```

`main.ts` does `NestFactory.create(AppModule)` — Nest walks this `imports` array recursively. Skip a module here → its controllers never get routes, its providers can never be injected anywhere. No error, just silent absence.

**Exports matter too** — a module's providers are private unless listed in `exports`:

```ts
// agents.module.ts
@Module({
  imports: [VectorModule, McpModule],
  controllers: [AgentsController],
  providers: [MastraService],
  exports: [MastraService],   // ← lets OTHER modules inject MastraService
})
```
`WorkflowsModule` imports `AgentsModule` specifically so `WorkflowsService` can constructor-inject `MastraService` — one shared agent instance, not a duplicate.

---

## 3. Decorator reference (every decorator actually used in this repo)

| Decorator | Role | Example |
|---|---|---|
| `@Module()` | Declares `imports`/`controllers`/`providers`/`exports` | every `*.module.ts` |
| `@Controller(prefix)` | Route prefix for a controller class | `@Controller("api/workflows")` |
| `@Get(path?)` / `@Post(path?)` | Maps a method to a verb + path | `@Post("executive-briefing/:customerId")` |
| `@Injectable()` | Marks a class as a DI-constructable provider | every `*.service.ts` |
| `@Body()` / `@Body('field')` | Whole parsed body, or one named field | `@Body() body: ChatRequestDto` / `@Body("decision")` |
| `@Param('name')` | Named URL path parameter | `@Param("customerId") customerId: string` |
| `@UseInterceptors(FileInterceptor("file"))` | Wraps handler with Multer file parsing | `document.controller.ts` |
| `@UploadedFile()` | Parsed file object after the interceptor runs | `document.controller.ts` |
| `@InjectModel(Entity.name)` | Injects a Mongoose `Model<T>` | `customer.service.ts` |
| `@Schema(options)` | Marks a class as a Mongoose schema | `@Schema({ collection: "customers" })` |
| `@Prop(options?)` | One field of a `@Schema()` class | `@Prop({ required: true, unique: true })` |
| `@Catch()` | Exception filter — no args = catch-all | `LlmErrorFilter` |
| `@IsString()` `@MinLength()` `@IsOptional()` | `class-validator` field rules | `ChatRequestDto` |

**Not used anywhere in this repo:** `@Query()`, `@Req()`/`@Res()`, `@UseGuards()`, per-route `@UsePipes()`, custom `@Inject()` tokens, custom decorators.

**Not a decorator (common mix-up):** `OnModuleInit` / `OnModuleDestroy` are TypeScript interfaces you `implements`, with a plain `onModuleInit()` method Nest calls automatically — no `@` symbol involved.

---

## 4. Global Pipes vs. Global Filters

| | Pipes | Filters |
|---|---|---|
| Direction | **Incoming** request data | **Outgoing** errors/exceptions |
| Purpose | Transform/validate before the handler runs | Decide the HTTP response for a thrown error |
| This project's example | `ValidationPipe` | `LlmErrorFilter` |

**Pipe** — registered once, applies to every request:
```ts
// main.ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```
Runs `class-validator` decorators on any typed DTO param (e.g. `ChatRequestDto`) and 400s before the controller method executes if invalid. `whitelist: true` strips undeclared extra properties.

**Filter** — registered once, catches everything:
```ts
// main.ts
app.useGlobalFilters(new LlmErrorFilter());
```
```ts
@Catch()  // no args = catches every exception
export class LlmErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // 1. HttpException (404s, BadRequestException, etc.) → pass through unchanged
    // 2. message matches /api[-_]?key/i → 503 with an actionable "set ANTHROPIC_API_KEY" message
    // 3. anything else → generic 500
  }
}
```
Mental model: **pipes guard the front door, filters guard the back door.**

---

## 5. Validation types — three separate systems, three different boundaries

| System | Boundary it guards | Where |
|---|---|---|
| `class-validator` + `ValidationPipe` | HTTP request body | `ChatRequestDto` |
| Zod schemas | LLM tool-call args / structured output | `mastra.service.ts`, `mcp-server/src/server.ts` |
| Inline manual `if` | Ad-hoc, no schema at all | `WorkflowsController` |

**a) `class-validator`** — the only DTO in the backend:
```ts
export class ChatRequestDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;
}
```

**b) Zod** — a completely different boundary (LLM in/out, not HTTP):
- Tool input schemas (MCP server): `{ customerId: z.string().describe(...) }`
- Structured output schemas (Mastra `.generate()`): `{ output: meetingAnalysisOutputSchema }`

**c) Inline check** — no DTO, no Zod:
```ts
// workflows.controller.ts
if (decision !== "approved" && decision !== "rejected") {
  throw new BadRequestException("decision must be 'approved' or 'rejected'");
}
```

**Rule of thumb:** `class-validator` validates what a *human/browser* sends in; Zod validates what the *LLM* is allowed to send/produce. They never validate the same data.

---

## 6. Injected Mongoose models — schema, or actual data?

`@InjectModel(Entity.name)` gives you a live **`Model<T>` query handle**, not a static schema and not pre-loaded data. Nothing is fetched until you call a method on it.

```ts
constructor(@InjectModel(CustomerEntity.name) private readonly customerModel: Model<CustomerRecord>) {}

async list() {
  return this.customerModel.find().sort({ name: 1 }).lean();      // read: no input, returns docs
}
async findById(customerId: string) {
  return this.customerModel.findOne({ customerId }).lean();       // read: filter only
}
```

```ts
// document.service.ts — a write path
await this.documentModel.create({
  documentId, filename, documentType, customerId, source, chunkCount, sizeBytes,
});                                                                 // write: full data object
```

**It does not depend on GET vs POST at the framework level** — the injected model object is identical either way. What differs is **which Mongoose method you call**:

| Operation | Method | Input | Output |
|---|---|---|---|
| Read (`GET`) | `.find()` / `.findOne()` | filter query, no data payload | hydrated document(s) |
| Write (`POST`) | `.create()` / `.updateOne()` | full data object matching `@Prop()` shape | the written/updated doc |

The `@Schema()`/`@Prop()` decorators only define **shape + constraints** (e.g. `required: true`, `unique: true`); the injected `Model` is the runtime CRUD tool against that shape.

One codebase-specific convention worth noting: `CustomerEntity`'s own doc comment marks that model as deliberately **read-only** — *"the AI agent never queries this directly, it goes through the CRM MCP server... so the same business logic and access boundary applies whether a human or the agent is asking."* `Model<T>` technically supports writes, but this particular model is only ever called with `find()`/`findOne()` in practice — a codebase discipline, not a language restriction.

---

## 7. Mongoose glue functions — `forRoot` vs `forFeature` vs `SchemaFactory`

Three distinct jobs, easy to conflate because they all live under `@nestjs/mongoose`:

| Function | Job | Cardinality | Where in this repo |
|---|---|---|---|
| `MongooseModule.forRootAsync({...})` | Opens the **one** actual database connection for the whole app | Called **once**, in the root module | `app.module.ts` |
| `MongooseModule.forFeature([...])` | Registers **which schemas** a given feature module is allowed to inject models for | Called **once per feature module** | `customers.module.ts`, `documents.module.ts`, `transcription.module.ts` |
| `SchemaFactory.createForClass(Entity)` | Converts a `@Schema()`/`@Prop()`-decorated **class** into an actual Mongoose `Schema` object | Called **once per entity**, in the schema file itself | `customer.schema.ts` |

**`forRootAsync` — the connection** (`app.module.ts`):
```ts
MongooseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({ uri: config.get<string>("mongoUrl") }),
}),
```
- "Async" because the Mongo URI comes from `ConfigService`, which itself needs to be resolved through DI first — `inject` lists what the factory function needs, `useFactory` is the function Nest calls with those resolved dependencies to produce the actual connection options.
- This establishes the physical `mongodb://...` connection. It happens **exactly once**, in `AppModule`. Feature modules never open their own connections.

**`forFeature` — the per-module schema registration** (e.g. `customers.module.ts`):
```ts
MongooseModule.forFeature([{ name: CustomerEntity.name, schema: CustomerSchema }]),
```
- This does *not* open a new connection — it reuses the one from `forRootAsync`.
- It tells Nest's DI container: "within this module, `@InjectModel(CustomerEntity.name)` should resolve to a `Model` bound to the `CustomerSchema`." Without this line in `CustomersModule`, `@InjectModel(CustomerEntity.name)` in `CustomerService` would fail to resolve.
- Each feature module registers only the schema(s) it needs — `DocumentsModule` registers `DocumentEntity`, `TranscriptionModule` registers `MeetingEntity`, etc. This keeps the DI graph scoped: a module can't accidentally inject a model it never declared.

**`SchemaFactory.createForClass` — class → schema** (`customer.schema.ts`):
```ts
@Schema({ collection: "customers" })
export class CustomerEntity {
  @Prop({ required: true, unique: true })
  customerId!: string;
  // ...
}

export const CustomerSchema = SchemaFactory.createForClass(CustomerEntity);
```
- `@Schema()`/`@Prop()` are just decorator *metadata* attached to the class — they don't do anything by themselves.
- `SchemaFactory.createForClass(CustomerEntity)` reads that metadata via `reflect-metadata` and builds the real Mongoose `Schema` instance (`CustomerSchema`) that Mongoose's engine actually understands (validators, indexes, field types).
- That resulting `CustomerSchema` is what gets handed to `forFeature([{ name: ..., schema: CustomerSchema }])` above — the class is source-of-truth NestJS decorator syntax; `SchemaFactory` is the bridge that turns it into what plain Mongoose expects.

**Putting the three together, in order of execution:**
```
1. customer.schema.ts:   @Schema()/@Prop() class  →  SchemaFactory.createForClass()  →  CustomerSchema
2. app.module.ts:        MongooseModule.forRootAsync()  →  one DB connection for the app
3. customers.module.ts:  MongooseModule.forFeature([{ name: "CustomerEntity", schema: CustomerSchema }])
4. customer.service.ts:  @InjectModel(CustomerEntity.name) → resolves to a live Model<CustomerRecord>
```

---

## 8. Guards (`CanActivate`) and custom Pipes (`PipeTransform`)

**This project has neither.** No `CanActivate` guard and no custom `PipeTransform` exist anywhere in `backend/src` — confirmed by grep. The only pipe in use is the built-in global `ValidationPipe` (see §4/§5), and there is no authentication/authorization layer at all (every route in every controller is fully open).

Still useful to know what these *are*, since they're the natural next thing this codebase is missing:

### Guards — `CanActivate`

A Guard runs **before** the route handler (and before body-parsing pipes) and answers one yes/no question: *is this request allowed to proceed at all?* Typically used for auth/roles — not data shape.

```ts
// hypothetical: backend/src/common/guards/api-key.guard.ts
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    return req.headers["x-api-key"] === process.env.INTERNAL_API_KEY;
  }
}
```
Applied per-controller/route with `@UseGuards(ApiKeyGuard)`, or globally via `app.useGlobalGuards(new ApiKeyGuard())` in `main.ts` — the same three registration levels (global / controller / method) that pipes and filters support.

Where this repo would plausibly add one: `AgentsController`'s `POST /api/chat` and `WorkflowsController`'s `POST .../decision` are both wide open — a `CanActivate` guard is exactly the mechanism NestJS gives you to close that gap without touching the handler logic itself.

### Custom Pipes — `PipeTransform`

A Pipe runs **on a specific argument**, transforming or validating it before it reaches the handler's parameter. The built-in `ValidationPipe` is one; you can also write your own for one-off argument-level checks that don't warrant a whole DTO class.

```ts
// hypothetical: backend/src/common/pipes/parse-decision.pipe.ts
@Injectable()
export class ParseDecisionPipe implements PipeTransform<string, "approved" | "rejected"> {
  transform(value: string): "approved" | "rejected" {
    if (value !== "approved" && value !== "rejected") {
      throw new BadRequestException("decision must be 'approved' or 'rejected'");
    }
    return value;
  }
}
```
Applied directly on the parameter: `@Body("decision", ParseDecisionPipe) decision: "approved" | "rejected"`.

This would be the natural refactor of the manual `if` check currently sitting in `WorkflowsController` (see §5c) — instead of an inline check inside the handler body, the validation would move to the parameter boundary, consistent with how `ValidationPipe` already handles `ChatRequestDto`.

**Guards vs. Pipes, in one line:** a Guard decides *whether the request runs at all* (identity/permission); a Pipe decides *whether this argument's value is well-formed* (shape/type) — Guards run first, then Pipes, then the handler body.
