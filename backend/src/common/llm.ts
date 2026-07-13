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
  return stripTemperature(anthropic(modelId));
}

/**
 * The pinned `ai` SDK (v4, required by this @mastra/core version) always
 * sends `temperature: 0` unless a caller overrides it - there is no way to
 * make it omit the field entirely until `ai` v5. Newer Claude models
 * (e.g. claude-sonnet-5) reject that implicit temperature outright
 * ("`temperature` is deprecated for this model"), which turns every
 * agent.generate() call into a 500. Strip it at the provider boundary
 * instead of upgrading the whole SDK stack.
 */
function stripTemperature<T extends object>(model: T): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      if (prop === "doGenerate" || prop === "doStream") {
        const original = Reflect.get(target, prop, target) as (options: unknown) => unknown;
        return (options: Record<string, unknown>) => original.call(target, { ...options, temperature: undefined });
      }
      return Reflect.get(target, prop, target) ?? Reflect.get(target, prop, receiver);
    },
  });
}
