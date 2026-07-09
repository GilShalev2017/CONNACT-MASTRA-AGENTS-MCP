import { ConfigService } from "@nestjs/config";

/**
 * Single place that resolves the LLM used by every Mastra agent in this
 * app. Centralizing it means swapping providers (or supporting per-agent
 * overrides) is a one-file change instead of a search-and-replace across
 * every agent definition.
 */
export async function createLanguageModel(config: ConfigService) {
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const apiKey = config.get<string>("llm.anthropicApiKey");
  const modelId = config.get<string>("llm.model")!;
  const anthropic = createAnthropic({ apiKey: apiKey || undefined });
  return anthropic(modelId);
}
