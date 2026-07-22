import type OpenAI from "openai";
import {
  CompanyEnrichmentError,
  CompanyEnrichmentTimeoutError,
  InvalidCompanyEnrichmentResponseError,
} from "./errors.ts";
import {
  COMPANY_ENRICHMENT_JSON_SCHEMA,
  COMPANY_ENRICHMENT_SCHEMA_NAME,
  parseCompanyEnrichmentOutput,
} from "./schema.ts";
import type { CompanyEnrichmentInput, CompanyEnrichmentProvider } from "./types.ts";

/**
 * Testable core of the OpenAI web-search COMPANY-ENRICHMENT provider. Fully
 * decoupled from the global OpenAI client: `createResponse` is injected, so
 * tests assert the exact request and mock the response with no network
 * access. A thin server-only wrapper supplies the real client.
 *
 * Unlike the domain-restricted business-research provider, this fallback has
 * no confirmed official domain to restrict the search to (that is precisely
 * why it runs) — the search is open, and the model is instructed to prefer
 * the official website and other reliable sources.
 */

/** This optional fallback call must NEVER auto-retry. */
export const COMPANY_ENRICHMENT_MAX_RETRIES = 0;

export type CreateEnrichmentResponseFn = (
  params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  options: { signal?: AbortSignal; maxRetries: number },
) => Promise<unknown>;

export interface OpenAiCompanyEnrichmentDeps {
  createResponse: CreateEnrichmentResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

const COMPANY_ENRICHMENT_INSTRUCTIONS = [
  "You research PUBLIC, factual information about ONE already-identified Polish",
  "legal company, using its legal name and registry identifiers (KRS/NIP).",
  "You MUST use the web_search tool at least once; never answer from memory alone.",
  "Prefer the company's OFFICIAL WEBSITE when its address is given or",
  "discoverable, and otherwise prefer reliable sources (government/registry",
  "pages, established business directories, or news outlets). Return the",
  "result strictly in the provided JSON schema.",
  "Report ONLY company-as-entity facts:",
  "- description: one short neutral paragraph describing what the company does",
  "  (empty string when truly unknown).",
  "- industry: a short label for the company's industry/sector (empty string",
  "  when unknown).",
  "- foundedYear: the year the company was founded/established, or null when",
  "  unknown.",
  "- website: the company's official website origin (scheme + host, no path),",
  "  or null when unknown.",
  "- productsServices / customerSegments / operatingMarkets: each a SHORT",
  "  discrete fact, one per array item; keep every array concise.",
  "Rules:",
  "- Write description, industry, productsServices, customerSegments and",
  "  operatingMarkets in natural, professional Polish suitable for a business",
  "  dashboard — even when your sources are in another language, translate the",
  "  facts rather than quoting them verbatim. Avoid English business jargon",
  "  when a clear Polish term exists.",
  "- Preserve the official company name, brand names, product names and",
  "  trademarks in their original form (do not translate them). NEVER",
  "  translate a website URL, or the KRS, NIP or REGON identifiers.",
  "- NEVER guess or invent; use an empty string / null / empty array when",
  "  evidence is insufficient.",
  "- NEVER return financial figures (revenue, profit, valuation) or employee counts.",
  "- NEVER return information about natural persons (owners, founders, board",
  "  members, employees, contact persons, names, emails, phone numbers,",
  "  addresses, or social-profile links).",
  "- Avoid marketing language and superlatives.",
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

export function createOpenAiCompanyEnrichmentProvider(
  deps: OpenAiCompanyEnrichmentDeps,
): CompanyEnrichmentProvider {
  return {
    name: "openai_web_search_enrichment",
    async enrich(
      input: CompanyEnrichmentInput,
      options?: { signal?: AbortSignal },
    ) {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: deps.model,
        instructions: COMPANY_ENRICHMENT_INSTRUCTIONS,
        // Only the allowlisted input is sent — NEVER a raw KRS payload.
        input: JSON.stringify(input),
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        text: {
          format: {
            type: "json_schema",
            name: COMPANY_ENRICHMENT_SCHEMA_NAME,
            schema: COMPANY_ENRICHMENT_JSON_SCHEMA,
            strict: true,
          },
        },
        store: false,
        max_output_tokens: deps.maxOutputTokens,
      };

      let response: unknown;
      try {
        response = await deps.createResponse(params, {
          signal: combined,
          maxRetries: COMPANY_ENRICHMENT_MAX_RETRIES,
        });
      } catch (cause) {
        if (options?.signal?.aborted) throw cause; // caller cancellation propagates
        if (timeout.aborted) throw new CompanyEnrichmentTimeoutError();
        throw new CompanyEnrichmentError("OpenAI company enrichment request failed", cause);
      }

      const record = asRecord(response);
      if (!record) {
        throw new InvalidCompanyEnrichmentResponseError("Empty company enrichment response");
      }
      if (record.status === "incomplete") {
        throw new InvalidCompanyEnrichmentResponseError("Company enrichment response was incomplete");
      }
      if (hasRefusal(record)) {
        throw new InvalidCompanyEnrichmentResponseError("Company enrichment response was refused");
      }

      const outputText = typeof record.output_text === "string" ? record.output_text : "";
      if (outputText.trim().length === 0) {
        throw new InvalidCompanyEnrichmentResponseError("Company enrichment response had no output");
      }

      return parseCompanyEnrichmentOutput(outputText);
    },
  };
}
