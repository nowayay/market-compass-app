import "server-only";
import { getOpenAIClient } from "../../ai/client";
import { getAIConfig } from "../../ai/config";
import { getBusinessResearchConfig } from "./config";
import { createOpenAiBusinessResearchProvider } from "./createOpenAiBusinessResearchProvider";
import type {
  BusinessResearchInput,
  BusinessResearchProviderResult,
  CompanyBusinessResearchProvider,
} from "./types";

/**
 * Production business-research provider backed by the OpenAI Responses API with
 * the built-in `web_search` tool (domain-restricted) + Structured Outputs.
 *
 * It is LAZY: constructing it reads no configuration and creates no OpenAI
 * client. Config + client are consulted only on the first real
 * `researchBusiness()` call, so disabled / non-research flows never need a key.
 *
 * Retry safety: paid research calls pass `maxRetries: 0` per request, overriding
 * the shared client's default — WITHOUT changing other flows.
 */
let singleton: CompanyBusinessResearchProvider | null = null;

export function createOpenAiCompanyBusinessResearchProvider(): CompanyBusinessResearchProvider {
  if (!singleton) {
    let inner: CompanyBusinessResearchProvider | null = null;
    const build = (): CompanyBusinessResearchProvider => {
      const { model } = getAIConfig();
      const { timeoutMs, maxOutputTokens, maxToolCalls } = getBusinessResearchConfig();
      const client = getOpenAIClient();
      return createOpenAiBusinessResearchProvider({
        createResponse: (params, options) =>
          client.responses.create(params, {
            signal: options.signal,
            maxRetries: options.maxRetries,
          }),
        model,
        timeoutMs,
        maxOutputTokens,
        maxToolCalls,
      });
    };

    singleton = {
      name: "openai_web_search_business",
      researchBusiness(
        input: BusinessResearchInput,
        options?: { signal?: AbortSignal },
      ): Promise<BusinessResearchProviderResult> {
        if (!inner) inner = build();
        return inner.researchBusiness(input, options);
      },
    };
  }
  return singleton;
}
