import type OpenAI from "openai";
import {
  CompanyIdentificationError,
  CompanyIdentificationTimeoutError,
  InvalidIdentificationResponseError,
} from "../errors.ts";
import {
  IDENTIFICATION_JSON_SCHEMA,
  IDENTIFICATION_SCHEMA_NAME,
  parseDiscoveryOutput,
} from "./discoverySchema.ts";
import { extractWebSearchSources } from "./extractWebSearchSources.ts";
import type {
  CompanyIdentificationProvider,
  DiscoveryResult,
  IdentificationQuery,
} from "./types.ts";

/**
 * Testable core of the OpenAI web-search identification provider. It is fully
 * decoupled from the global OpenAI client: the `createResponse` function is
 * injected, so tests can assert the exact request and mock the response with no
 * network access. A thin server-only wrapper supplies the real client.
 */

/**
 * Responses API create params for identification. `max_tool_calls` is a real,
 * supported API parameter but is missing from this SDK version's REST create
 * type, so we augment the type explicitly (rather than bypass typing with `any`).
 */
export type IdentificationCreateParams = OpenAI.Responses.ResponseCreateParamsNonStreaming & {
  max_tool_calls?: number;
};

export type CreateResponseFn = (
  params: IdentificationCreateParams,
  options: { signal?: AbortSignal },
) => Promise<unknown>;

export interface OpenAiIdentificationDeps {
  createResponse: CreateResponseFn;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxToolCalls: number;
}

const IDENTIFICATION_INSTRUCTIONS = [
  "You identify Polish companies (legal entities in the KRS register) by name.",
  "You MUST use the web_search tool to find candidates; never answer from memory.",
  "Return the result strictly in the provided JSON schema.",
  "Rules:",
  "- Only include entities that have a Polish KRS number.",
  "- Return at most 5 candidates.",
  "- NEVER include information about natural persons (board members, owners,",
  "  shareholders, representatives, proxies, employees, contact persons, PESEL,",
  "  birth dates, private addresses, emails or phone numbers). A person's surname",
  "  inside a company's legal name is allowed as part of the company name only.",
  "- Do not include page content, article text, snippets, URLs or descriptions.",
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

export function createOpenAiIdentificationProvider(
  deps: OpenAiIdentificationDeps,
): CompanyIdentificationProvider {
  return {
    name: "openai_web_search",
    async discoverCandidates(
      query: IdentificationQuery,
      signal?: AbortSignal,
    ): Promise<DiscoveryResult> {
      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

      // Only the safe, user-provided fields are sent to the model.
      const input = JSON.stringify({
        name: query.name,
        countryCode: query.countryCode,
        foundedYear: query.foundedYear,
      });

      const params: IdentificationCreateParams = {
        model: deps.model,
        instructions: IDENTIFICATION_INSTRUCTIONS,
        input,
        tools: [{ type: "web_search" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        text: {
          format: {
            type: "json_schema",
            name: IDENTIFICATION_SCHEMA_NAME,
            schema: IDENTIFICATION_JSON_SCHEMA,
            strict: true,
          },
        },
        store: false,
        max_output_tokens: deps.maxOutputTokens,
        max_tool_calls: deps.maxToolCalls,
      };

      let response: unknown;
      try {
        response = await deps.createResponse(params, { signal: combined });
      } catch (cause) {
        if (signal?.aborted) throw cause; // caller cancellation propagates
        if (timeout.aborted) throw new CompanyIdentificationTimeoutError();
        throw new CompanyIdentificationError("OpenAI identification request failed", cause);
      }

      const record = asRecord(response);
      if (!record) {
        throw new InvalidIdentificationResponseError("Empty identification response");
      }
      if (record.status === "incomplete") {
        throw new InvalidIdentificationResponseError("Identification response was incomplete");
      }
      if (hasRefusal(record)) {
        throw new InvalidIdentificationResponseError("Identification response was refused");
      }

      const outputText = typeof record.output_text === "string" ? record.output_text : "";
      if (outputText.trim().length === 0) {
        throw new InvalidIdentificationResponseError("Identification response had no output");
      }

      // Structured candidates come from the model text (validated + allowlisted);
      // sources come ONLY from tool metadata, never from the model text.
      const candidates = parseDiscoveryOutput(outputText);
      const sources = extractWebSearchSources(response);
      return { candidates, sources };
    },
  };
}
