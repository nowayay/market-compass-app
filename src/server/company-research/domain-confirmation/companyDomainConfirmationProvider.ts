import "server-only";
import { getOpenAIClient } from "../../ai/client";
import { getAIConfig } from "../../ai/config";
import { getDomainConfirmationConfig } from "./config";
import { createOpenAiDomainConfirmationProvider } from "./createOpenAiDomainConfirmationProvider";
import type {
  CompanyDomainConfirmationProvider,
  DomainConfirmationInput,
  DomainConfirmationProviderResult,
} from "./types";

/**
 * Production domain-confirmation provider backed by the OpenAI Responses API with
 * the built-in `web_search` tool (domain-restricted) + Structured Outputs.
 *
 * It is LAZY: constructing it reads no configuration and creates no OpenAI
 * client. Config + client are consulted only on the first real `confirmDomain()`
 * call, so disabled / non-confirmation flows never need an OpenAI key.
 *
 * Retry safety: paid confirmation calls pass `maxRetries: 0` per request,
 * overriding the shared client's default — WITHOUT changing chat, identification
 * or discovery behavior.
 */
let singleton: CompanyDomainConfirmationProvider | null = null;

export function createOpenAiCompanyDomainConfirmationProvider(): CompanyDomainConfirmationProvider {
  if (!singleton) {
    let inner: CompanyDomainConfirmationProvider | null = null;
    const build = (): CompanyDomainConfirmationProvider => {
      const { model } = getAIConfig();
      const { timeoutMs, maxOutputTokens, maxToolCalls } = getDomainConfirmationConfig();
      const client = getOpenAIClient();
      return createOpenAiDomainConfirmationProvider({
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
      name: "openai_web_search_confirmation",
      confirmDomain(
        input: DomainConfirmationInput,
        options?: { signal?: AbortSignal },
      ): Promise<DomainConfirmationProviderResult> {
        if (!inner) inner = build();
        return inner.confirmDomain(input, options);
      },
    };
  }
  return singleton;
}
