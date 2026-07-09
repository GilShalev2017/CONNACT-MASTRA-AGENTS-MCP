/**
 * Centralized environment configuration. NestJS's ConfigModule loads this
 * factory once and makes it available for injection everywhere, so no
 * module reaches into `process.env` directly - that keeps every external
 * dependency (Mongo, Qdrant, the MCP server, the LLM provider) swappable
 * from one place, which matters once this runs in more than one
 * environment (local docker-compose vs. a real cloud deployment).
 */
const configuration = () => ({
  port: parseInt(process.env.PORT ?? "3000", 10),
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017/connact",
  qdrant: {
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    collection: process.env.QDRANT_COLLECTION ?? "connact_knowledge",
  },
  mcp: {
    crmServerUrl: process.env.CRM_MCP_SERVER_URL ?? "http://localhost:4100/mcp",
  },
  llm: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  },
  embedding: {
    model: process.env.EMBEDDING_MODEL ?? "Xenova/all-MiniLM-L6-v2",
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS ?? "384", 10),
  },
  knowledgeDocsPath: process.env.KNOWLEDGE_DOCS_PATH ?? "/app/data/knowledge-docs",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
});

export type AppConfig = ReturnType<typeof configuration>;
export default configuration;
