import type OpenAI from "openai";
import {
  DomainConfirmationError,
  DomainConfirmationTimeoutError,
  InvalidDomainConfirmationResponseError,
} from "./errors.ts";
import {
  DOMAIN_CONFIRMATION_JSON_SCHEMA,
  DOMAIN_CONFIRMATION_SCHEMA_NAME,
  normalizeFoundIdentifiers,
  parseConfirmationOutput,
} from "./schema.ts";
import { extractConfirmationEvidence } from "./extractConfirmationEvidence.ts";
import { allowedDomainsFor } from "./targetHosts.ts";
import type {
  CompanyDomainConfirmationProvider,
  DomainConfirmationInput,
  DomainConfirmationProviderResult,
} from "./types.ts";

/**
 * Testable core of the OpenAI web-search DOMAIN-CONFIRMATION provider. Fully
 * decoupled from the global OpenAI client: `createResponse` is injected, so tests
 * assert the exact request and mock the response with no network access. A thin
 * server-only wrapper supplies the real client with `maxRetries: 0`.
 */

/** Paid confirmation must NEVER auto-retry (unlike the shared client's maxRetries). */
export const DOMAIN_CONFIRMATION_MAX_RETRIES = 0;

/** `max_tool_calls` is a real API param missing from this SDK's REST create type. */
export type DomainConfirmationCreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & {
  max_tool_calls?: number;
};

export type CreateConfirmationResponseFn = (
  params: DomainConfirmationCreateParams,
  options: { signal?: AbortSignal; maxRetries: number },
) => Promise<unknown>;

export interface OpenAiDomainConfirmationDeps {
  createResponse: CreateConfirmationResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolCalls: number;
}

const DOMAIN_CONFIRMATION_INSTRUCTIONS = [
  "You verify the OFFICIAL registry identifiers published on ONE company website.",
  "The web_search tool is restricted to a single allowed domain; use ONLY pages",
  "from that domain. You MUST use the web_search tool; never answer from memory.",
  "Return the result strictly in the provided JSON schema.",
  "Task: report every registry identifier LITERALLY visible on pages from the",
  "allowed domain:",
  "- foundKrsValues: KRS numbers, foundNipValues: NIP numbers,",
  "  foundRegonValues: REGON numbers.",
  "Rules:",
  "- Report a value ONLY if it is literally printed on a page of the allowed",
  "  domain (e.g. an imprint / 'kontakt' / footer). NEVER guess or infer.",
  "- Return an EMPTY array for an identifier that is not found.",
  "- At most 3 values per array.",
  "- Do NOT return names, email addresses, phone numbers, PESEL values, persons,",
  "  descriptions, titles, snippets, page content, URLs, confidences or flags.",
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

export function createOpenAiDomainConfirmationProvider(
  deps: OpenAiDomainConfirmationDeps,
): CompanyDomainConfirmationProvider {
  return {
    name: "openai_web_search_confirmation",
    async confirmDomain(
      input: DomainConfirmationInput,
      options?: { signal?: AbortSignal },
    ): Promise<DomainConfirmationProviderResult> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout;

      const params: DomainConfirmationCreateParams = {
        model: deps.model,
        instructions: DOMAIN_CONFIRMATION_INSTRUCTIONS,
        // Only the allowlisted input is sent — NEVER the expected identifiers.
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
            name: DOMAIN_CONFIRMATION_SCHEMA_NAME,
            schema: DOMAIN_CONFIRMATION_JSON_SCHEMA,
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
          maxRetries: DOMAIN_CONFIRMATION_MAX_RETRIES,
        });
      } catch (cause) {
        if (options?.signal?.aborted) throw cause; // caller cancellation propagates
        if (timeout.aborted) throw new DomainConfirmationTimeoutError();
        throw new DomainConfirmationError("OpenAI domain confirmation request failed", cause);
      }

      const record = asRecord(response);
      if (!record) {
        throw new InvalidDomainConfirmationResponseError("Empty domain confirmation response");
      }
      if (record.status === "incomplete") {
        throw new InvalidDomainConfirmationResponseError("Domain confirmation response was incomplete");
      }
      if (hasRefusal(record)) {
        throw new InvalidDomainConfirmationResponseError("Domain confirmation response was refused");
      }

      const outputText = typeof record.output_text === "string" ? record.output_text : "";
      if (outputText.trim().length === 0) {
        throw new InvalidDomainConfirmationResponseError("Domain confirmation response had no output");
      }

      // Identifiers come from the validated model text; attested on-domain sources
      // come ONLY from tool metadata, never from the model text.
      const raw = parseConfirmationOutput(outputText);
      const found = normalizeFoundIdentifiers(raw);
      const sourceOrigins = extractConfirmationEvidence(response, input.targetDomain);
      return { found, sourceOrigins };
    },
  };
}
