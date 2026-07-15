import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAiIdentificationProvider,
} from "../identification/createOpenAiIdentificationProvider.ts";
import type {
  CreateResponseFn,
  IdentificationCreateParams,
} from "../identification/createOpenAiIdentificationProvider.ts";
import {
  CompanyIdentificationError,
  CompanyIdentificationTimeoutError,
  InvalidIdentificationResponseError,
} from "../errors.ts";
import { MAX_DISCOVERED_CANDIDATES } from "../identification/discoverySchema.ts";

const QUERY = { name: "Przykładowa Sp. z o.o.", countryCode: "PL", foundedYear: 2011 };

function provider(createResponse: CreateResponseFn, timeoutMs = 5000) {
  return createOpenAiIdentificationProvider({
    createResponse,
    model: "test-model",
    timeoutMs,
    maxOutputTokens: 2000,
    maxToolCalls: 3,
  });
}

function successResponse(candidatesJson: unknown, output: unknown[] = []) {
  return {
    status: "completed",
    output_text: typeof candidatesJson === "string" ? candidatesJson : JSON.stringify(candidatesJson),
    output,
  };
}

test("sends the exact Structured-Output + web-search request", async () => {
  let captured: IdentificationCreateParams | null = null;
  const p = provider(async (params) => {
    captured = params;
    return successResponse({ candidates: [] });
  });
  await p.discoverCandidates(QUERY);

  assert.ok(captured);
  const params = captured as IdentificationCreateParams;
  // tools + tool_choice + include
  assert.deepEqual(params.tools, [{ type: "web_search" }]);
  assert.equal(params.tool_choice, "required");
  assert.ok((params.include ?? []).includes("web_search_call.action.sources"));
  // strict json_schema structured output
  const format = params.text?.format as Record<string, unknown> | undefined;
  assert.equal(format?.type, "json_schema");
  assert.equal(format?.strict, true);
  assert.ok(typeof format?.name === "string");
  assert.ok(format?.schema && typeof format.schema === "object");
  // JSON Schema caps candidates at the shared constant (belt to the runtime cap).
  const schema = format?.schema as Record<string, unknown>;
  const properties = schema.properties as Record<string, Record<string, unknown>>;
  assert.equal(properties.candidates.maxItems, MAX_DISCOVERED_CANDIDATES);
  // cost controls
  assert.equal(params.store, false);
  assert.equal(params.max_output_tokens, 2000);
  assert.equal(params.max_tool_calls, 3);
  // input contains only the allowed query fields (no KRS, no person data)
  const input = JSON.parse(String(params.input));
  assert.deepEqual(Object.keys(input).sort(), ["countryCode", "foundedYear", "name"]);
  assert.equal(input.name, QUERY.name);
});

test("returns validated candidates and REAL sources from tool metadata", async () => {
  const p = provider(async () =>
    successResponse(
      { candidates: [{ legalName: "Alfa", krs: "0000000001", city: null, countryCode: "PL", foundedYear: null }] },
      [{ type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: "https://src.com/x" }] } }],
    ),
  );
  const result = await p.discoverCandidates(QUERY);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].krs, "0000000001");
  assert.deepEqual(result.sources, [{ origin: "https://src.com", hostname: "src.com" }]);
});

test("response.status incomplete → InvalidIdentificationResponseError", async () => {
  const p = provider(async () => ({ status: "incomplete", output_text: "", output: [] }));
  await assert.rejects(() => p.discoverCandidates(QUERY), InvalidIdentificationResponseError);
});

test("refusal → InvalidIdentificationResponseError", async () => {
  const p = provider(async () => ({
    status: "completed",
    output_text: "",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
  }));
  await assert.rejects(() => p.discoverCandidates(QUERY), InvalidIdentificationResponseError);
});

test("no output text → InvalidIdentificationResponseError", async () => {
  const p = provider(async () => ({ status: "completed", output_text: "   ", output: [] }));
  await assert.rejects(() => p.discoverCandidates(QUERY), InvalidIdentificationResponseError);
});

test("invalid structured output (not JSON) → InvalidIdentificationResponseError", async () => {
  const p = provider(async () => successResponse("<<<not json>>>"));
  await assert.rejects(() => p.discoverCandidates(QUERY), InvalidIdentificationResponseError);
});

test("provider error → CompanyIdentificationError (no raw output leak)", async () => {
  const p = provider(async () => {
    throw new Error("raw openai internal detail");
  });
  await assert.rejects(
    () => p.discoverCandidates(QUERY),
    (e: unknown) => {
      assert.ok(e instanceof CompanyIdentificationError);
      assert.ok(!e.publicMessage.includes("raw openai internal detail"));
      return true;
    },
  );
});

test("timeout → CompanyIdentificationTimeoutError", async () => {
  const hanging: CreateResponseFn = (_params, opts) =>
    new Promise((_resolve, reject) => {
      const s = opts.signal;
      if (s?.aborted) {
        reject(s.reason ?? new DOMException("aborted", "AbortError"));
        return;
      }
      s?.addEventListener("abort", () => reject(s.reason ?? new DOMException("aborted", "AbortError")));
    });
  const p = provider(hanging, 20);
  await assert.rejects(() => p.discoverCandidates(QUERY), CompanyIdentificationTimeoutError);
});
