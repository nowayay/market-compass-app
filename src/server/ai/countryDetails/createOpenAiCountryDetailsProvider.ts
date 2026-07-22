import type OpenAI from "openai";
import {
  CountryDetailsError,
  CountryDetailsTimeoutError,
  InvalidCountryDetailsResponseError,
} from "./errors.ts";
import {
  COUNTRY_DETAILS_JSON_SCHEMA,
  COUNTRY_DETAILS_SCHEMA_NAME,
  parseCountryDetailsOutput,
} from "./schema.ts";
import type { CountryDetailsInput, CountryDetailsProvider } from "./types.ts";
import type { CountryDetails } from "../../../contracts/countryDetails.ts";

/**
 * Testable core of the OpenAI country-details provider. Decoupled from the
 * global OpenAI client: `createResponse` is injected, so tests assert the exact
 * request and mock the response with no network access. A thin server-only
 * wrapper supplies the real client.
 */

/** Transport-level retries: ZERO. A timeout is never auto-retried. */
export const COUNTRY_DETAILS_MAX_RETRIES = 0;

export type CreateResponseFn = (
  params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  options: { signal?: AbortSignal; maxRetries: number },
) => Promise<unknown>;

export interface OpenAiCountryDetailsDeps {
  createResponse: CreateResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

const INSTRUCTIONS = [
  "You are an international-expansion analyst for a Polish company.",
  "You receive a JSON object with the company's PUBLIC profile and ONE target",
  "country (with its already-computed 0-100 expansion score). Produce a focused",
  "deep-dive for THAT country only, based solely on the given profile.",
  "Return the result strictly in the provided JSON schema, with EXACTLY:",
  "- scoreRationale: why this country earned its score (1-2 sentences).",
  "- opportunities: EXACTLY 4 concrete opportunities.",
  "- risks: EXACTLY 4 concrete risks.",
  "- customerSegments: EXACTLY 3 relevant customer segments in this market.",
  "- competition: a short competitive-landscape summary.",
  "- entryModel: the recommended market-entry model (e.g. distributor, direct,",
  "  partnership, e-commerce).",
  "- barriers: EXACTLY 3 entry barriers (regulatory, tariff, cultural, etc.).",
  "- firstSteps: EXACTLY 3 concrete first steps to take.",
  '- confidenceLevel: one of "low", "medium", "high".',
  "- confidenceRationale: a short justification for that confidence level.",
  "Rules:",
  "- Write EVERY human-readable field in natural, professional Polish.",
  "- Keep every field concise; no field longer than ~400 characters.",
  "- Never invent specific financial figures (revenue, exact costs, budgets).",
  "- Never give legal or tax guarantees or specific legal/tax advice.",
  "- NEVER include information about natural persons (owners, employees,",
  "  contacts, addresses, emails, phone numbers).",
  "- Return ONLY the fields defined in the schema — no extra prose, no Markdown.",
].join("\n");

const RETRY_INSTRUCTIONS = `${INSTRUCTIONS}

Your previous response did not satisfy the required structure. Answer again and make sure opportunities and risks each have EXACTLY 4 items, customerSegments/barriers/firstSteps each have EXACTLY 3, confidenceLevel is one of low/medium/high, and every field is present and non-empty.`;

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

/** Runs exactly one OpenAI call + validation pass; never retries by itself. */
async function runOneAttempt(
  deps: OpenAiCountryDetailsDeps,
  input: CountryDetailsInput,
  instructions: string,
  signal: AbortSignal,
): Promise<CountryDetails> {
  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: deps.model,
    instructions,
    input: JSON.stringify(input),
    text: {
      format: {
        type: "json_schema",
        name: COUNTRY_DETAILS_SCHEMA_NAME,
        schema: COUNTRY_DETAILS_JSON_SCHEMA,
        strict: true,
      },
    },
    store: false,
    max_output_tokens: deps.maxOutputTokens,
  };

  const response = await deps.createResponse(params, { signal, maxRetries: COUNTRY_DETAILS_MAX_RETRIES });

  const record = asRecord(response);
  if (!record) {
    throw new InvalidCountryDetailsResponseError("Empty country details response");
  }
  if (record.status === "incomplete") {
    throw new InvalidCountryDetailsResponseError("Country details response was incomplete");
  }
  if (hasRefusal(record)) {
    throw new InvalidCountryDetailsResponseError("Country details response was refused");
  }

  const outputText = typeof record.output_text === "string" ? record.output_text : "";
  if (outputText.trim().length === 0) {
    throw new InvalidCountryDetailsResponseError("Country details response had no output");
  }

  return parseCountryDetailsOutput(outputText);
}

export function createOpenAiCountryDetailsProvider(
  deps: OpenAiCountryDetailsDeps,
): CountryDetailsProvider {
  return {
    name: "openai_country_details",
    async generate(input: CountryDetailsInput, options?: { signal?: AbortSignal }): Promise<CountryDetails> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      async function attempt(instructions: string): Promise<CountryDetails> {
        try {
          return await runOneAttempt(deps, input, instructions, combined);
        } catch (cause) {
          if (cause instanceof InvalidCountryDetailsResponseError) throw cause;
          if (options?.signal?.aborted) throw cause; // caller cancellation propagates
          if (timeout.aborted) throw new CountryDetailsTimeoutError();
          throw new CountryDetailsError("OpenAI country details request failed", cause);
        }
      }

      try {
        return await attempt(INSTRUCTIONS);
      } catch (firstError) {
        // Only a structural validation failure is retried, exactly once;
        // transport/timeout/abort failures are never re-issued.
        if (!(firstError instanceof InvalidCountryDetailsResponseError) || combined.aborted) {
          throw firstError;
        }
        return await attempt(RETRY_INSTRUCTIONS);
      }
    },
  };
}
