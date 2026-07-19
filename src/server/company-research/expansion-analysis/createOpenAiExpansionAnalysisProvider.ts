import type OpenAI from "openai";
import {
  ExpansionAnalysisError,
  ExpansionAnalysisTimeoutError,
  InvalidExpansionAnalysisResponseError,
} from "../errors.ts";
import { logPipelineStage, stageErrorReasonCode } from "../logging/pipelineStageLog.ts";
import { EXPANSION_ANALYSIS_JSON_SCHEMA, EXPANSION_ANALYSIS_SCHEMA_NAME, parseExpansionAnalysisOutput } from "./schema.ts";
import type { ExpansionAnalysisInput, ExpansionAnalysisProvider } from "./types.ts";
import type { ExpansionAnalysis } from "../../../contracts/companyDashboard.ts";

/**
 * Testable core of the OpenAI expansion-analysis provider. Fully decoupled
 * from the global OpenAI client: `createResponse` is injected, so tests can
 * assert the exact request and mock the response with no network access. A
 * thin server-only wrapper supplies the real client.
 */

export type CreateResponseFn = (
  params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  options: { signal?: AbortSignal },
) => Promise<unknown>;

export interface OpenAiExpansionAnalysisDeps {
  createResponse: CreateResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
}

const EXPANSION_ANALYSIS_INSTRUCTIONS = [
  "You are an international-expansion analyst for a Polish company.",
  "You will receive a JSON object describing the company's PUBLIC, already-verified",
  "profile (legal name, industry, description, products/services, customer segments,",
  "operating markets). Base your analysis ONLY on this profile.",
  "Return the result strictly in the provided JSON schema.",
  "Rules:",
  "- Recommend EXACTLY 15 distinct countries, each with a real ISO 3166-1 alpha-2 code.",
  "- Each country score is 0-100; higher means a better expansion fit.",
  "- Provide 3 to 5 concise bullet points for each SWOT category (strengths,",
  "  weaknesses, opportunities, threats) about the company's expansion potential.",
  "- Never invent specific financial figures (revenue, exact costs, exact budgets).",
  "- Never give legal or tax guarantees or specific legal/tax advice.",
  "- NEVER include information about natural persons (owners, board members,",
  "  employees, contact persons, addresses, emails or phone numbers).",
  "- Write every human-readable field in Polish: the SWOT bullets, and each",
  "  country's summary, opportunities and risks.",
  "- countryName MUST be the Polish name of the country (e.g. \"Niemcy\",",
  "  \"Stany Zjednoczone\", \"Wielka Brytania\", \"Korea Południowa\") — never",
  "  the English name.",
  "- countryCode stays an unchanged, untranslated ISO 3166-1 alpha-2 code",
  "  (e.g. \"DE\", \"US\", \"GB\", \"KR\").",
].join("\n");

/**
 * Appended to the base instructions for the single automatic retry attempt,
 * after the first response failed structural validation. Deliberately short —
 * it never echoes the model's raw prior output (which may be malformed JSON
 * or, per policy, might carry content we must not replay) and only restates
 * the invariants a corrected response must satisfy.
 */
const EXPANSION_ANALYSIS_RETRY_INSTRUCTIONS = `${EXPANSION_ANALYSIS_INSTRUCTIONS}

Your previous response did not satisfy the required structure. Before answering again, double-check that:
- there are EXACTLY 15 ranked countries, all with distinct ISO 3166-1 alpha-2 codes,
- every score is a plain number from 0 to 100 inclusive,
- the JSON matches the provided schema exactly, with no missing or extra fields.`;

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
  deps: OpenAiExpansionAnalysisDeps,
  input: ExpansionAnalysisInput,
  instructions: string,
  signal: AbortSignal,
): Promise<ExpansionAnalysis> {
  const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
    model: deps.model,
    instructions,
    input: JSON.stringify(input),
    text: {
      format: {
        type: "json_schema",
        name: EXPANSION_ANALYSIS_SCHEMA_NAME,
        schema: EXPANSION_ANALYSIS_JSON_SCHEMA,
        strict: true,
      },
    },
    store: false,
    max_output_tokens: deps.maxOutputTokens,
  };

  const response = await deps.createResponse(params, { signal });

  const record = asRecord(response);
  if (!record) {
    throw new InvalidExpansionAnalysisResponseError("Empty expansion analysis response");
  }
  if (record.status === "incomplete") {
    throw new InvalidExpansionAnalysisResponseError("Expansion analysis response was incomplete");
  }
  if (hasRefusal(record)) {
    throw new InvalidExpansionAnalysisResponseError("Expansion analysis response was refused");
  }

  const outputText = typeof record.output_text === "string" ? record.output_text : "";
  if (outputText.trim().length === 0) {
    throw new InvalidExpansionAnalysisResponseError("Expansion analysis response had no output");
  }

  return parseExpansionAnalysisOutput(outputText);
}

export function createOpenAiExpansionAnalysisProvider(
  deps: OpenAiExpansionAnalysisDeps,
): ExpansionAnalysisProvider {
  return {
    name: "openai_expansion_analysis",
    async analyze(input: ExpansionAnalysisInput, options?: { signal?: AbortSignal }): Promise<ExpansionAnalysis> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      async function attempt(instructions: string): Promise<ExpansionAnalysis> {
        try {
          return await runOneAttempt(deps, input, instructions, combined);
        } catch (cause) {
          // A structural/validation failure is retryable by the caller below —
          // re-throw it unchanged (it already carries a safe, stable code).
          if (cause instanceof InvalidExpansionAnalysisResponseError) throw cause;
          if (options?.signal?.aborted) throw cause; // caller cancellation propagates
          if (timeout.aborted) throw new ExpansionAnalysisTimeoutError();
          throw new ExpansionAnalysisError("OpenAI expansion analysis request failed", cause);
        }
      }

      try {
        return await attempt(EXPANSION_ANALYSIS_INSTRUCTIONS);
      } catch (firstError) {
        // Company research is never re-run here: a retry only re-issues this
        // same AI call with a short corrective instruction — nothing upstream
        // (identification, KRS, web research) repeats. Only a structural
        // validation failure is retried; transport/timeout/abort failures are
        // not, since re-prompting cannot fix those. At most one retry ever runs.
        if (!(firstError instanceof InvalidExpansionAnalysisResponseError) || combined.aborted) {
          throw firstError;
        }
        logPipelineStage("expansion-analysis", "retry", stageErrorReasonCode(firstError));
        return await attempt(EXPANSION_ANALYSIS_RETRY_INSTRUCTIONS);
      }
    },
  };
}
