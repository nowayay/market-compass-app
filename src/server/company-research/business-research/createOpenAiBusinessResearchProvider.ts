import type OpenAI from "openai";
import {
  BusinessResearchError,
  BusinessResearchTimeoutError,
  InvalidBusinessResearchResponseError,
} from "./errors.ts";
import {
  BUSINESS_RESEARCH_JSON_SCHEMA,
  BUSINESS_RESEARCH_SCHEMA_NAME,
  parseBusinessResearchOutput,
} from "./schema.ts";
import { extractBusinessSources } from "./extractBusinessSources.ts";
import { allowedDomainsFor } from "../domain-confirmation/targetHosts.ts";
import type {
  BusinessResearchInput,
  BusinessResearchProviderResult,
  CompanyBusinessResearchProvider,
} from "./types.ts";

/**
 * Testable core of the OpenAI web-search BUSINESS-RESEARCH provider. Fully
 * decoupled from the global OpenAI client: `createResponse` is injected, so tests
 * assert the exact request and mock the response with no network access. A thin
 * server-only wrapper supplies the real client with `maxRetries: 0`.
 */

/** Paid business research must NEVER auto-retry. */
export const BUSINESS_RESEARCH_MAX_RETRIES = 0;

/** `max_tool_calls` is a real API param missing from this SDK's REST create type. */
export type BusinessResearchCreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & {
  max_tool_calls?: number;
};

export type CreateBusinessResponseFn = (
  params: BusinessResearchCreateParams,
  options: { signal?: AbortSignal; maxRetries: number },
) => Promise<unknown>;

export interface OpenAiBusinessResearchDeps {
  createResponse: CreateBusinessResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolCalls: number;
}

const BUSINESS_RESEARCH_INSTRUCTIONS = [
  "You research factual business information about ONE already-identified legal",
  "company by inspecting ONLY its official website (the web_search tool is",
  "restricted to a single allowed domain; use ONLY pages from that domain).",
  "You MUST use the web_search tool; never answer from memory. Return the result",
  "strictly in the provided JSON schema.",
  "Report facts about the identified legal company only:",
  "- industryDescription: one short neutral phrase describing what the company",
  "  does (or null when unclear).",
  "- productsServices / customerSegments / operatingMarkets: each a SHORT discrete",
  "  fact, one per array item.",
  "Rules:",
  "- NEVER guess; return empty arrays / null when evidence is insufficient.",
  "- Avoid marketing language and superlatives.",
  "- Do NOT duplicate translated or equivalent facts.",
  "- Do NOT treat seller listings, partner offerings or unrelated group companies",
  "  as the researched company's own products.",
  "- When sources contradict or scope is unclear, report the matching ambiguity",
  "  code instead of silently choosing one alternative.",
  "- NEVER return personal or contact data (names of natural persons, emails,",
  "  phone numbers, PESEL, social profiles), URLs, page content, snippets,",
  "  confidences or recommendations.",
].join("\n");

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

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

export function createOpenAiBusinessResearchProvider(
  deps: OpenAiBusinessResearchDeps,
): CompanyBusinessResearchProvider {
  return {
    name: "openai_web_search_business",
    async researchBusiness(
      input: BusinessResearchInput,
      options?: { signal?: AbortSignal },
    ): Promise<BusinessResearchProviderResult> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      const params: BusinessResearchCreateParams = {
        model: deps.model,
        instructions: BUSINESS_RESEARCH_INSTRUCTIONS,
        // Only the allowlisted input is sent — NEVER identifiers/PKD/raw payloads.
        input: JSON.stringify(input),
        tools: [
          {
            type: "web_search",
            // Restrict to the target host + its exact www/apex counterpart.
            filters: { allowed_domains: allowedDomainsFor(input.targetDomain) },
          },
        ],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_schema",
            name: BUSINESS_RESEARCH_SCHEMA_NAME,
            schema: BUSINESS_RESEARCH_JSON_SCHEMA,
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
          maxRetries: BUSINESS_RESEARCH_MAX_RETRIES,
        });
      } catch (cause) {
        if (options?.signal?.aborted) throw cause; // caller cancellation propagates
        if (timeout.aborted) throw new BusinessResearchTimeoutError();
        throw new BusinessResearchError("OpenAI business research request failed", cause);
      }

      const record = asRecord(response);
      if (!record) {
        throw new InvalidBusinessResearchResponseError("Empty business research response");
      }
      if (record.status === "incomplete") {
        throw new InvalidBusinessResearchResponseError("Business research response was incomplete");
      }
      if (hasRefusal(record)) {
        throw new InvalidBusinessResearchResponseError("Business research response was refused");
      }

      const outputText = typeof record.output_text === "string" ? record.output_text : "";
      if (outputText.trim().length === 0) {
        throw new InvalidBusinessResearchResponseError("Business research response had no output");
      }

      // Facts come from the validated model text; attested on-domain sources come
      // ONLY from tool metadata of THIS call, never from the model text.
      const facts = parseBusinessResearchOutput(outputText);
      const sourceOrigins = extractBusinessSources(response, input.targetDomain);
      return { facts, sourceOrigins };
    },
  };
}
