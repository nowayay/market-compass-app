import "server-only";
import { getOpenAIClient } from "../../ai/client";
import { getAIConfig } from "../../ai/config";
import { getDomainDiscoveryConfig } from "./config";
import { createOpenAiDomainDiscoveryProvider } from "./createOpenAiDomainDiscoveryProvider";
import type {
  CompanyDomainDiscoveryInput,
  CompanyDomainDiscoveryProvider,
  CompanyDomainDiscoveryResult,
} from "./types";

/**
 * Production domain-discovery provider backed by the OpenAI Responses API with
 * the built-in `web_search` tool + Structured Outputs.
 *
 * It is LAZY: constructing it reads no configuration and creates no OpenAI
 * client. Config + client are consulted only on the first real
 * `discoverDomainCandidates()` call, so disabled / non-discovery flows never
 * need an OpenAI key.
 *
 * Retry safety: paid discovery calls pass `maxRetries: 0` per request, overriding
 * the shared client's `maxRetries: 2` — WITHOUT changing chat or identification
 * behavior.
 */
let singleton: CompanyDomainDiscoveryProvider | null = null;

export function createOpenAiCompanyDomainDiscoveryProvider(): CompanyDomainDiscoveryProvider {
  if (!singleton) {
    let inner: CompanyDomainDiscoveryProvider | null = null;
    const build = (): CompanyDomainDiscoveryProvider => {
      const { model } = getAIConfig();
      const { timeoutMs, maxOutputTokens, maxToolCalls } = getDomainDiscoveryConfig();
      const client = getOpenAIClient();
      return createOpenAiDomainDiscoveryProvider({
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
      name: "openai_web_search_domain",
      discoverDomainCandidates(
        input: CompanyDomainDiscoveryInput,
        options?: { signal?: AbortSignal },
      ): Promise<CompanyDomainDiscoveryResult> {
        if (!inner) inner = build();
        return inner.discoverDomainCandidates(input, options);
      },
    };
  }
  return singleton;
}
