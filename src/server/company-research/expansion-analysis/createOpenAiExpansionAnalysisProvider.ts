import type OpenAI from "openai";
import {
  ExpansionAnalysisError,
  ExpansionAnalysisTimeoutError,
  InvalidExpansionAnalysisResponseError,
} from "../errors.ts";
import {
  logExpansionAnalysisCall,
  logPipelineStage,
  stageErrorReasonCode,
} from "../logging/pipelineStageLog.ts";
import { EXPANSION_ANALYSIS_JSON_SCHEMA, EXPANSION_ANALYSIS_SCHEMA_NAME, parseExpansionAnalysisOutput } from "./schema.ts";
import type { ExpansionAnalysisInput, ExpansionAnalysisProvider } from "./types.ts";
import type { ExpansionAnalysis } from "../../../contracts/companyDashboard.ts";

/**
 * Testable core of the OpenAI expansion-analysis provider. Fully decoupled
 * from the global OpenAI client: `createResponse` is injected, so tests can
 * assert the exact request and mock the response with no network access. A
 * thin server-only wrapper supplies the real client.
 */

/**
 * Transport-level retries for a single expansion-analysis OpenAI call: ZERO.
 * A timeout or transport failure must NEVER be auto-retried — re-issuing an
 * identical, already-slow call would only stack latency on top of a stage that
 * already has a hard 180s budget. The ONLY retry this provider ever performs is
 * the single schema-correction retry below, triggered exclusively by a
 * structurally invalid (not a timed-out or failed) response.
 */
export const EXPANSION_ANALYSIS_MAX_RETRIES = 0;

export type CreateResponseFn = (
  params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
  options: { signal?: AbortSignal; maxRetries: number },
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
  "- Each country summary is a single concise sentence of AT MOST 180 characters.",
  "- Provide EXACTLY 4 concise bullet points for each SWOT category (strengths,",
  "  weaknesses, opportunities, threats) about the company's expansion potential.",
  "- Every SWOT bullet is AT MOST 180 characters.",
  "- Return ONLY the fields defined in the schema — no preamble, no extra prose,",
  "  no commentary, no markdown; keep every text field terse.",
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
- each SWOT category has EXACTLY 4 bullets, and every bullet and every country summary is at most 180 characters,
- the JSON matches the provided schema exactly, with no missing or extra fields.`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/** Maps a terminal failure to the safe outcome label used in timing telemetry. */
function classifyOutcome(error: unknown): "timeout" | "invalid" | "error" {
  if (error instanceof ExpansionAnalysisTimeoutError) return "timeout";
  if (error instanceof InvalidExpansionAnalysisResponseError) return "invalid";
  return "error";
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

/**
 * Runs exactly one OpenAI call + validation pass; never retries by itself.
 * `onOpenAiCall` receives the wall-clock duration of the OpenAI call ITSELF
 * (excluding local validation), for timing telemetry — it is invoked whether
 * the call resolves or rejects. Transport-level retries are disabled
 * (`maxRetries: 0`), so a timeout/transport failure surfaces immediately.
 */
async function runOneAttempt(
  deps: OpenAiExpansionAnalysisDeps,
  input: ExpansionAnalysisInput,
  instructions: string,
  signal: AbortSignal,
  onOpenAiCall: (ms: number) => void,
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

  const startedAt = Date.now();
  let response: unknown;
  try {
    response = await deps.createResponse(params, { signal, maxRetries: EXPANSION_ANALYSIS_MAX_RETRIES });
  } finally {
    onOpenAiCall(Date.now() - startedAt);
  }

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

      // Timing telemetry accumulated across the (at most two) attempts, always
      // emitted on the terminal path so a production timeout can be diagnosed.
      let openAiCallMs = 0;
      let retried = false;
      const recordCall = (ms: number) => {
        openAiCallMs += ms;
      };

      async function attempt(instructions: string): Promise<ExpansionAnalysis> {
        try {
          return await runOneAttempt(deps, input, instructions, combined, recordCall);
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
        let result: ExpansionAnalysis;
        try {
          result = await attempt(EXPANSION_ANALYSIS_INSTRUCTIONS);
        } catch (firstError) {
          // Company research is never re-run here: a retry only re-issues this
          // same AI call with a short corrective instruction — nothing upstream
          // (identification, KRS, web research) repeats. Only a structural
          // validation failure is retried; transport/timeout/abort failures are
          // not, since re-prompting cannot fix those. At most one retry ever runs.
          if (!(firstError instanceof InvalidExpansionAnalysisResponseError) || combined.aborted) {
            throw firstError;
          }
          retried = true;
          logPipelineStage("expansion-analysis", "retry", stageErrorReasonCode(firstError));
          result = await attempt(EXPANSION_ANALYSIS_RETRY_INSTRUCTIONS);
        }
        logExpansionAnalysisCall({ openAiCallMs, retried, outcome: "completed" });
        return result;
      } catch (error) {
        logExpansionAnalysisCall({ openAiCallMs, retried, outcome: classifyOutcome(error) });
        throw error;
      }
    },
  };
}
