import "server-only";
import { getOpenAIClient } from "../../ai/client";
import { getAIConfig } from "../../ai/config";
import { getCompanyResearchConfig } from "../config";
import { createOpenAiIdentificationProvider } from "../identification/createOpenAiIdentificationProvider";
import { lazyIdentificationProvider } from "../identification/lazyIdentificationProvider";
import type { CompanyIdentificationProvider } from "../identification/types";

/**
 * Production identification provider backed by the OpenAI Responses API with the
 * built-in `web_search` tool + Structured Outputs.
 *
 * It is LAZY: constructing it (e.g. when building route deps) reads no
 * configuration and creates no OpenAI client. `getAIConfig()`, the company-
 * research config and `getOpenAIClient()` are consulted only on the first real
 * `discoverCandidates()` call. This keeps the exact-KRS, selected-candidate and
 * feature-flag-disabled flows fully working without an OpenAI API key.
 *
 * A module-level lazy singleton is reused across requests once initialized.
 */
let singleton: CompanyIdentificationProvider | null = null;

export function createOpenAiCompanyIdentificationProvider(): CompanyIdentificationProvider {
  if (!singleton) {
    singleton = lazyIdentificationProvider(() => {
      const { model } = getAIConfig();
      const {
        identificationTimeoutMs,
        identificationMaxOutputTokens,
        identificationMaxToolCalls,
      } = getCompanyResearchConfig();
      const client = getOpenAIClient();

      return createOpenAiIdentificationProvider({
        createResponse: (params, options) => client.responses.create(params, options),
        model,
        timeoutMs: identificationTimeoutMs,
        maxOutputTokens: identificationMaxOutputTokens,
        maxToolCalls: identificationMaxToolCalls,
      });
    });
  }
  return singleton;
}
