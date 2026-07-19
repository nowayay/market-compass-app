import type OpenAI from "openai";
import {
  ExpansionAnalysisError,
  ExpansionAnalysisTimeoutError,
  InvalidExpansionAnalysisResponseError,
} from "../errors.ts";
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
  "- Recommend EXACTLY 5 distinct countries, each with a real ISO 3166-1 alpha-2 code.",
  "- Each country score is 0-100; higher means a better expansion fit.",
  "- Provide 3 to 5 concise bullet points for each SWOT category (strengths,",
  "  weaknesses, opportunities, threats) about the company's expansion potential.",
  "- Never invent specific financial figures (revenue, exact costs, exact budgets).",
  "- Never give legal or tax guarantees or specific legal/tax advice.",
  "- NEVER include information about natural persons (owners, board members,",
  "  employees, contact persons, addresses, emails or phone numbers).",
  "- Write in Polish.",
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

export function createOpenAiExpansionAnalysisProvider(
  deps: OpenAiExpansionAnalysisDeps,
): ExpansionAnalysisProvider {
  return {
    name: "openai_expansion_analysis",
    async analyze(input: ExpansionAnalysisInput, options?: { signal?: AbortSignal }): Promise<ExpansionAnalysis> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

      const params: OpenAI.Responses.ResponseCreateParamsNonStreaming = {
        model: deps.model,
        instructions: EXPANSION_ANALYSIS_INSTRUCTIONS,
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

      let response: unknown;
      try {
        response = await deps.createResponse(params, { signal: combined });
      } catch (cause) {
        if (options?.signal?.aborted) throw cause; // caller cancellation propagates
        if (timeout.aborted) throw new ExpansionAnalysisTimeoutError();
        throw new ExpansionAnalysisError("OpenAI expansion analysis request failed", cause);
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
    },
  };
}
