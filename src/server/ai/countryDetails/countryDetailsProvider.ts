import "server-only";
import { getOpenAIClient } from "../client.ts";
import { getAIConfig } from "../config.ts";
import { createOpenAiCountryDetailsProvider } from "./createOpenAiCountryDetailsProvider.ts";
import type { CountryDetailsProvider } from "./types.ts";

/**
 * Bounded cost/latency for the single country-details call. Well under the
 * OpenAI client request timeout (`ai/client.ts`, 240s) so the stage's own
 * AbortSignal.timeout is the binding cutoff.
 */
const COUNTRY_DETAILS_TIMEOUT_MS = 60_000;
const COUNTRY_DETAILS_MAX_OUTPUT_TOKENS = 2000;

/**
 * Production country-details provider backed by the OpenAI Responses API +
 * Structured Outputs, reusing the SAME OpenAI client/config as the rest of the
 * app. LAZY: constructing it reads no configuration and creates no client;
 * both are consulted only on the first real `generate()` call.
 */
let singleton: CountryDetailsProvider | null = null;

export function createCountryDetailsProvider(): CountryDetailsProvider {
  if (!singleton) {
    let inner: CountryDetailsProvider | null = null;
    singleton = {
      name: "openai_country_details",
      generate(input, options) {
        if (!inner) {
          const { model } = getAIConfig();
          const client = getOpenAIClient();
          inner = createOpenAiCountryDetailsProvider({
            createResponse: (params, opts) =>
              client.responses.create(params, { signal: opts.signal, maxRetries: opts.maxRetries }),
            model,
            timeoutMs: COUNTRY_DETAILS_TIMEOUT_MS,
            maxOutputTokens: COUNTRY_DETAILS_MAX_OUTPUT_TOKENS,
          });
        }
        return inner.generate(input, options);
      },
    };
  }
  return singleton;
}
