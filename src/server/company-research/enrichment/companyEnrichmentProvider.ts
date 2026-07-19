import "server-only";
import { getOpenAIClient } from "../../ai/client.ts";
import { getAIConfig } from "../../ai/config.ts";
import { createOpenAiCompanyEnrichmentProvider } from "./createOpenAiCompanyEnrichmentProvider.ts";
import type { CompanyEnrichmentProvider } from "./types.ts";

/** Bounded cost/latency for the single, optional enrichment fallback call. */
const COMPANY_ENRICHMENT_TIMEOUT_MS = 30_000;
const COMPANY_ENRICHMENT_MAX_OUTPUT_TOKENS = 1500;

/**
 * Production company-enrichment provider backed by the OpenAI Responses API
 * with the built-in `web_search` tool + Structured Outputs. It reuses the SAME
 * OpenAI client/config as the rest of the app (`server/ai/client.ts` /
 * `server/ai/config.ts`) — no second AI provider is introduced.
 *
 * LAZY: constructing it reads no configuration and creates no OpenAI client.
 * Config + client are consulted only on the first real `enrich()` call, so
 * building route deps never requires an API key when this optional fallback
 * is never reached (profile already has business facts).
 */
let singleton: CompanyEnrichmentProvider | null = null;

export function createCompanyEnrichmentProvider(): CompanyEnrichmentProvider {
  if (!singleton) {
    let inner: CompanyEnrichmentProvider | null = null;
    singleton = {
      name: "openai_web_search_enrichment",
      enrich(input, options) {
        if (!inner) {
          const { model } = getAIConfig();
          const client = getOpenAIClient();
          inner = createOpenAiCompanyEnrichmentProvider({
            createResponse: (params, opts) =>
              client.responses.create(params, { signal: opts.signal, maxRetries: opts.maxRetries }),
            model,
            timeoutMs: COMPANY_ENRICHMENT_TIMEOUT_MS,
            maxOutputTokens: COMPANY_ENRICHMENT_MAX_OUTPUT_TOKENS,
          });
        }
        return inner.enrich(input, options);
      },
    };
  }
  return singleton;
}
