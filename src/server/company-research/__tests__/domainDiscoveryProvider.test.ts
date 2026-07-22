import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAiDomainDiscoveryProvider,
  DOMAIN_DISCOVERY_MAX_RETRIES,
} from "../domain-discovery/createOpenAiDomainDiscoveryProvider.ts";
import type {
  CreateDomainResponseFn,
  DomainDiscoveryCreateParams,
} from "../domain-discovery/createOpenAiDomainDiscoveryProvider.ts";
import { buildDomainDiscoveryInput } from "../domain-discovery/buildDomainDiscoveryInput.ts";
import { MAX_DOMAIN_CANDIDATES } from "../domain-discovery/schema.ts";
import {
  DomainDiscoveryError,
  DomainDiscoveryTimeoutError,
  InvalidDomainDiscoveryResponseError,
} from "../domain-discovery/errors.ts";
import type { KrsCompany } from "../types.ts";

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "PRZYKŁADOWA SP. Z O.O.",
  legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  nip: "1234563218",
  regon: "123456785",
  registrationDate: "2011-01-01",
  city: "Warszawa",
  region: "Mazowieckie",
  countryCode: "PL",
  pkdPrimaryCode: "62.01.Z",
  pkdSecondaryCodes: [],
  pkdLabels: ["Działalność związana z oprogramowaniem"],
  registerType: "P",
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

const INPUT = buildDomainDiscoveryInput(COMPANY);

function provider(createResponse: CreateDomainResponseFn, timeoutMs = 5000) {
  return createOpenAiDomainDiscoveryProvider({
    createResponse,
    model: "test-model",
    timeoutMs,
    maxOutputTokens: 1200,
    maxToolCalls: 2,
  });
}

function successResponse(candidatesJson: unknown, output: unknown[] = []) {
  return {
    status: "completed",
    output_text: typeof candidatesJson === "string" ? candidatesJson : JSON.stringify(candidatesJson),
    output,
  };
}

test("sends the exact web-search + strict Structured-Output request", async () => {
  let capturedParams: DomainDiscoveryCreateParams | null = null;
  let capturedOptions: { signal?: AbortSignal; maxRetries: number } | null = null;
  const p = provider(async (params, options) => {
    capturedParams = params;
    capturedOptions = options;
    return successResponse({ candidates: [] });
  });
  await p.discoverDomainCandidates(INPUT);

  assert.ok(capturedParams);
  const params = capturedParams as DomainDiscoveryCreateParams;
  // web_search is required
  assert.deepEqual(params.tools, [{ type: "web_search" }]);
  assert.equal(params.tool_choice, "required");
  assert.ok((params.include ?? []).includes("web_search_call.action.sources"));
  // strict Structured Output with additionalProperties:false
  const format = params.text?.format as Record<string, unknown> | undefined;
  assert.equal(format?.type, "json_schema");
  assert.equal(format?.strict, true);
  const schema = format?.schema as Record<string, unknown>;
  assert.equal(schema.additionalProperties, false);
  const props = schema.properties as Record<string, Record<string, unknown>>;
  assert.equal(props.candidates.maxItems, MAX_DOMAIN_CANDIDATES);
  const itemSchema = props.candidates.items as Record<string, unknown>;
  assert.equal(itemSchema.additionalProperties, false);
  // cost controls
  assert.equal(params.store, false);
  assert.equal(params.max_output_tokens, 1200);
  assert.equal(params.max_tool_calls, 2);
  // dedicated retry count is zero + a timeout signal is present
  assert.ok(capturedOptions);
  const options = capturedOptions as { signal?: AbortSignal; maxRetries: number };
  assert.equal(options.maxRetries, 0);
  assert.equal(DOMAIN_DISCOVERY_MAX_RETRIES, 0);
  assert.ok(options.signal instanceof AbortSignal);
});

test("sends ONLY the allowlisted company input (no raw profile / personal fields)", async () => {
  let sent: Record<string, unknown> | null = null;
  const p = provider(async (params) => {
    sent = JSON.parse(String(params.input)) as Record<string, unknown>;
    return successResponse({ candidates: [] });
  });
  await p.discoverDomainCandidates(INPUT);

  const input = sent as unknown as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(input).sort(),
    ["aliases", "city", "countryCode", "krs", "legalForm", "legalName", "nip", "region", "regon"],
  );
  // No pkd codes, register type, retrievedAt, street address or person data.
  for (const forbidden of ["pkdPrimaryCode", "pkdLabels", "registerType", "retrievedAt", "address", "street"]) {
    assert.ok(!(forbidden in input), `leaked field: ${forbidden}`);
  }
});

test("accepts a candidate backed by attested web-search sources", async () => {
  const p = provider(async () =>
    successResponse(
      {
        candidates: [
          { url: "https://przykladowa.example/o-nas", matchedLegalName: "PRZYKŁADOWA SP. Z O.O.", matchedKrs: "0000123456", matchedNip: null, matchedRegon: null, matchedCity: "Warszawa" },
        ],
      },
      [{ type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: "https://przykladowa.example/kontakt" }] } }],
    ),
  );
  const result = await p.discoverDomainCandidates(INPUT);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].origin, "https://przykladowa.example");
  assert.equal(result.candidates[0].domain, "przykladowa.example");
});

test("incomplete response → InvalidDomainDiscoveryResponseError", async () => {
  const p = provider(async () => ({ status: "incomplete", output_text: "", output: [] }));
  await assert.rejects(() => p.discoverDomainCandidates(INPUT), InvalidDomainDiscoveryResponseError);
});

test("refusal → InvalidDomainDiscoveryResponseError", async () => {
  const p = provider(async () => ({
    status: "completed",
    output_text: "",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
  }));
  await assert.rejects(() => p.discoverDomainCandidates(INPUT), InvalidDomainDiscoveryResponseError);
});

test("provider error → DomainDiscoveryError (no raw output leak)", async () => {
  const p = provider(async () => {
    throw new Error("raw openai internal detail");
  });
  await assert.rejects(
    () => p.discoverDomainCandidates(INPUT),
    (e: unknown) => {
      assert.ok(e instanceof DomainDiscoveryError);
      assert.ok(!e.publicMessage.includes("raw openai internal detail"));
      assert.ok(!e.publicMessage.includes("przykladowa"));
      return true;
    },
  );
});

test("timeout signal is used → DomainDiscoveryTimeoutError", async () => {
  const hanging: CreateDomainResponseFn = (_params, opts) =>
    new Promise((_resolve, reject) => {
      const s = opts.signal;
      if (s?.aborted) {
        reject(s.reason ?? new DOMException("aborted", "AbortError"));
        return;
      }
      s?.addEventListener("abort", () => reject(s.reason ?? new DOMException("aborted", "AbortError")));
    });
  const p = provider(hanging, 20);
  await assert.rejects(() => p.discoverDomainCandidates(INPUT), DomainDiscoveryTimeoutError);
});
