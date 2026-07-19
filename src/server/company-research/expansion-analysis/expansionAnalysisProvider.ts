import "server-only";
import { getOpenAIClient } from "../../ai/client.ts";
import { getAIConfig } from "../../ai/config.ts";
import { createOpenAiExpansionAnalysisProvider } from "./createOpenAiExpansionAnalysisProvider.ts";
import type { ExpansionAnalysisProvider } from "./types.ts";

/** Bounded cost/latency for the single expansion-analysis call. */
const EXPANSION_ANALYSIS_TIMEOUT_MS = 45_000;
const EXPANSION_ANALYSIS_MAX_OUTPUT_TOKENS = 2500;

/**
 * Production expansion-analysis provider backed by the OpenAI Responses API +
 * Structured Outputs. It reuses the SAME OpenAI client/config as the existing
 * chat feature (`server/ai/client.ts` / `server/ai/config.ts`) — no second AI
 * provider is introduced.
 *
 * LAZY: constructing it reads no configuration and creates no OpenAI client.
 * `getAIConfig()` and `getOpenAIClient()` are consulted only on the first real
 * `analyze()` call, so building route deps never requires an API key when the
 * dashboard's completed path is never reached (needs_confirmation/not_found).
 *
 * A module-level lazy singleton is reused across requests once initialized.
 */
let singleton: ExpansionAnalysisProvider | null = null;

export function createExpansionAnalysisProvider(): ExpansionAnalysisProvider {
  if (!singleton) {
    let inner: ExpansionAnalysisProvider | null = null;
    singleton = {
      name: "openai_expansion_analysis",
      analyze(input, options) {
        if (!inner) {
          const { model } = getAIConfig();
          const client = getOpenAIClient();
          inner = createOpenAiExpansionAnalysisProvider({
            createResponse: (params, opts) => client.responses.create(params, opts),
            model,
            timeoutMs: EXPANSION_ANALYSIS_TIMEOUT_MS,
            maxOutputTokens: EXPANSION_ANALYSIS_MAX_OUTPUT_TOKENS,
          });
        }
        return inner.analyze(input, options);
      },
    };
  }
  return singleton;
}
