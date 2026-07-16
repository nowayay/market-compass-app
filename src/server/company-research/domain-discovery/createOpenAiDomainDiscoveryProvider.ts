import type OpenAI from "openai";
import {
  DomainDiscoveryError,
  DomainDiscoveryTimeoutError,
  InvalidDomainDiscoveryResponseError,
} from "./errors.ts";
import { extractWebSearchSources } from "../identification/extractWebSearchSources.ts";
import {
  DOMAIN_DISCOVERY_JSON_SCHEMA,
  DOMAIN_DISCOVERY_SCHEMA_NAME,
  parseDomainDiscoveryOutput,
} from "./schema.ts";
import { extractDomainCandidates } from "./extractDomainCandidates.ts";
import type {
  CompanyDomainDiscoveryInput,
  CompanyDomainDiscoveryProvider,
  CompanyDomainDiscoveryResult,
} from "./types.ts";

/**
 * Testable core of the OpenAI web-search DOMAIN-DISCOVERY provider. Fully
 * decoupled from the global OpenAI client: `createResponse` is injected, so tests
 * assert the exact request and mock the response with no network access. A thin
 * server-only wrapper supplies the real client with `maxRetries: 0`.
 */

/** Paid discovery must NEVER auto-retry (unlike the shared client's maxRetries=2). */
export const DOMAIN_DISCOVERY_MAX_RETRIES = 0;

/** `max_tool_calls` is a real API param missing from this SDK's REST create type. */
export type DomainDiscoveryCreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & {
  max_tool_calls?: number;
};

export type CreateDomainResponseFn = (
  params: DomainDiscoveryCreateParams,
  options: { signal?: AbortSignal; maxRetries: number },
) => Promise<unknown>;

export interface OpenAiDomainDiscoveryDeps {
  createResponse: CreateDomainResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolCalls: number;
}

const DOMAIN_DISCOVERY_INSTRUCTIONS = [
  "You find the OFFICIAL company website domain for one already-identified Polish",
  "company (a KRS-registered legal entity). The company is given as structured",
  "identifiers — treat it as already confirmed.",
  "You MUST use the web_search tool; never answer from memory.",
  "Return the result strictly in the provided JSON schema.",
  "Rules:",
  "- Return at most 3 candidate domains.",
  "- Prefer the company's own official website; do NOT return search engines,",
  "  social media, directories, KRS aggregators, encyclopedias, marketplaces,",
  "  job boards, review sites, URL shorteners or parked domains.",
  "- For each candidate report only the URL and which company signals matched",
  "  (legal name, KRS, NIP, REGON, city); use null where a signal is unknown.",
  "- NEVER include a confidence, a verified flag, page content, article text,",
  "  snippets, titles or descriptions.",
  "- NEVER include information about natural persons (board members, owners,",
  "  representatives, contact persons, emails, phone numbers, PESEL).",
].join("\n");

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** True if any output message part is a refusal. */
function hasRefusal(response: Record<string, unknown>): boolean {
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    const record = asRecord(item);
    if (!record || record.type !== "message") continue;
    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      const p = asRecord(part);
      if (p && p.type === "refusal") return true;
    }
  }
  return false;
}

export function createOpenAiDomainDiscoveryProvider(
  deps: OpenAiDomainDiscoveryDeps,
): CompanyDomainDiscoveryProvider {
  return {
    name: "openai_web_search_domain",
    async discoverDomainCandidates(
      input: CompanyDomainDiscoveryInput,
      options?: { signal?: AbortSignal },
    ): Promise<CompanyDomainDiscoveryResult> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;

      const params: DomainDiscoveryCreateParams = {
        model: deps.model,
        instructions: DOMAIN_DISCOVERY_INSTRUCTIONS,
        // Only the allowlisted, company-level input is sent to the model.
        input: JSON.stringify(input),
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_schema",
            name: DOMAIN_DISCOVERY_SCHEMA_NAME,
            schema: DOMAIN_DISCOVERY_JSON_SCHEMA,
            strict: true,
          },
        },
        store: false,
        max_output_tokens: deps.maxOutputTokens,
        max_tool_calls: deps.maxToolCalls,
      };

      let response: unknown;
      try {
        response = await deps.createResponse(params, {
          signal: combined,
          maxRetries: DOMAIN_DISCOVERY_MAX_RETRIES,
        });
      } catch (cause) {
        if (options?.signal?.aborted) throw cause; // caller cancellation propagates
        if (timeout.aborted) throw new DomainDiscoveryTimeoutError();
        throw new DomainDiscoveryError("OpenAI domain discovery request failed", cause);
      }

      const record = asRecord(response);
      if (!record) {
        throw new InvalidDomainDiscoveryResponseError("Empty domain discovery response");
      }
      if (record.status === "incomplete") {
        throw new InvalidDomainDiscoveryResponseError("Domain discovery response was incomplete");
      }
      if (hasRefusal(record)) {
        throw new InvalidDomainDiscoveryResponseError("Domain discovery response was refused");
      }

      const outputText = typeof record.output_text === "string" ? record.output_text : "";
      if (outputText.trim().length === 0) {
        throw new InvalidDomainDiscoveryResponseError("Domain discovery response had no output");
      }

      // Structured candidates come from the model text (validated + allowlisted);
      // attested sources come ONLY from tool metadata, never from the model text.
      const rawCandidates = parseDomainDiscoveryOutput(outputText);
      const attestedSources = extractWebSearchSources(response);
      const candidates = extractDomainCandidates(rawCandidates, attestedSources);
      return { candidates };
    },
  };
}
