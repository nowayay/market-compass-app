import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAiDomainConfirmationProvider,
  DOMAIN_CONFIRMATION_MAX_RETRIES,
} from "../domain-confirmation/createOpenAiDomainConfirmationProvider.ts";
import type {
  CreateConfirmationResponseFn,
  DomainConfirmationCreateParams,
} from "../domain-confirmation/createOpenAiDomainConfirmationProvider.ts";
import { buildDomainConfirmationInput } from "../domain-confirmation/buildDomainConfirmationInput.ts";
import { MAX_IDENTIFIER_VALUES } from "../domain-confirmation/schema.ts";
import {
  DomainConfirmationError,
  DomainConfirmationTimeoutError,
  InvalidDomainConfirmationResponseError,
} from "../domain-confirmation/errors.ts";
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

const INPUT = buildDomainConfirmationInput(COMPANY, {
  origin: "https://przykladowa.example",
  domain: "przykladowa.example",
});

function provider(createResponse: CreateConfirmationResponseFn, timeoutMs = 5000) {
  return createOpenAiDomainConfirmationProvider({
    createResponse,
    model: "test-model",
    timeoutMs,
    maxOutputTokens: 800,
    maxToolCalls: 2,
  });
}

function found(o: { krs?: string[]; nip?: string[]; regon?: string[] } = {}) {
  return {
    foundKrsValues: o.krs ?? [],
    foundNipValues: o.nip ?? [],
    foundRegonValues: o.regon ?? [],
  };
}

function successResponse(body: unknown, output: unknown[] = []) {
  return {
    status: "completed",
    output_text: typeof body === "string" ? body : JSON.stringify(body),
    output,
  };
}

type ToolWithFilters = { type: string; filters?: { allowed_domains?: string[] } };

test("sends the exact domain-restricted web-search + strict Structured-Output request", async () => {
  let capturedParams: DomainConfirmationCreateParams | null = null;
  let capturedOptions: { signal?: AbortSignal; maxRetries: number } | null = null;
  const p = provider(async (params, options) => {
    capturedParams = params;
    capturedOptions = options;
    return successResponse(found());
  });
  await p.confirmDomain(INPUT);

  assert.ok(capturedParams);
  const params = capturedParams as DomainConfirmationCreateParams;

  // (4) web_search is required
  const tool = (params.tools ?? [])[0] as ToolWithFilters;
  assert.equal(tool.type, "web_search");
  assert.equal(params.tool_choice, "required");
  assert.ok((params.include ?? []).includes("web_search_call.action.sources"));

  // (5) allowed_domains contains ONLY the target apex + www counterpart
  assert.deepEqual(tool.filters?.allowed_domains, ["przykladowa.example", "www.przykladowa.example"]);

  // (10/11) strict Structured Output, additionalProperties false, maxItems 3
  const format = params.text?.format as Record<string, unknown> | undefined;
  assert.equal(format?.type, "json_schema");
  assert.equal(format?.strict, true);
  const s = format?.schema as { additionalProperties: boolean; properties: Record<string, { maxItems?: number }> };
  assert.equal(s.additionalProperties, false);
  assert.equal(s.properties.foundNipValues.maxItems, MAX_IDENTIFIER_VALUES);

  // (6) store is false + (8) bounded cost controls
  assert.equal(params.store, false);
  assert.equal(params.max_output_tokens, 800);
  assert.equal(params.max_tool_calls, 2);

  // (7) dedicated retry count is zero + (9) a timeout signal is present
  assert.ok(capturedOptions);
  const options = capturedOptions as { signal?: AbortSignal; maxRetries: number };
  assert.equal(options.maxRetries, 0);
  assert.equal(DOMAIN_CONFIRMATION_MAX_RETRIES, 0);
  assert.ok(options.signal instanceof AbortSignal);
});

// (3) serialized OpenAI request does not contain expected identifier values
test("the serialized request never contains the expected KRS/NIP/REGON values", async () => {
  let serialized = "";
  let sentInput: Record<string, unknown> | null = null;
  const p = provider(async (params) => {
    serialized = JSON.stringify(params);
    sentInput = JSON.parse(String(params.input)) as Record<string, unknown>;
    return successResponse(found());
  });
  await p.confirmDomain(INPUT);

  assert.ok(!serialized.includes(COMPANY.krs), "leaked KRS");
  assert.ok(!serialized.includes(COMPANY.nip as string), "leaked NIP");
  assert.ok(!serialized.includes(COMPANY.regon as string), "leaked REGON");

  // (2) the input object itself carries no identifier fields
  const input = sentInput as unknown as Record<string, unknown>;
  assert.ok(!("krs" in input) && !("nip" in input) && !("regon" in input));
  assert.deepEqual(
    Object.keys(input).sort(),
    ["city", "countryCode", "legalName", "region", "targetDomain", "targetOrigin"],
  );
});

// (5) apex target → apex + www; www target → same set
test("allowed_domains for a www target still yields exactly the two counterparts", async () => {
  let capturedParams: DomainConfirmationCreateParams | null = null;
  const p = provider(async (params) => {
    capturedParams = params;
    return successResponse(found());
  });
  await p.confirmDomain(
    buildDomainConfirmationInput(COMPANY, {
      origin: "https://www.przykladowa.example",
      domain: "www.przykladowa.example",
    }),
  );
  const tool = ((capturedParams as unknown as DomainConfirmationCreateParams).tools ?? [])[0] as ToolWithFilters;
  assert.deepEqual(tool.filters?.allowed_domains, ["przykladowa.example", "www.przykladowa.example"]);
});

// (14) empty arrays accepted → empty found, no sources
test("a valid response with empty arrays yields empty found identifiers", async () => {
  const p = provider(async () => successResponse(found()));
  const result = await p.confirmDomain(INPUT);
  assert.deepEqual(result.found.krs, []);
  assert.deepEqual(result.found.nip, []);
  assert.deepEqual(result.found.regon, []);
  assert.deepEqual(result.sourceOrigins, []);
});

// (15/18) provider-attested on-domain source (incl. www) accepted, origin-only
test("keeps only attested on-target-domain source origins", async () => {
  const p = provider(async () =>
    successResponse(found({ nip: ["1234563218"] }), [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [
            { type: "url", url: "https://www.przykladowa.example/kontakt?ref=x#foot" },
            { type: "url", url: "https://other.example/aggregator" },
          ],
        },
      },
    ]),
  );
  const result = await p.confirmDomain(INPUT);
  assert.deepEqual(result.sourceOrigins, ["https://www.przykladowa.example"]);
  assert.ok(!JSON.stringify(result).includes("/kontakt"));
  assert.ok(!JSON.stringify(result).includes("other.example"));
});

// (37) incomplete / refusal / timeout fail closed at the provider boundary
test("incomplete response → InvalidDomainConfirmationResponseError", async () => {
  const p = provider(async () => ({ status: "incomplete", output_text: "", output: [] }));
  await assert.rejects(() => p.confirmDomain(INPUT), InvalidDomainConfirmationResponseError);
});

test("refusal → InvalidDomainConfirmationResponseError", async () => {
  const p = provider(async () => ({
    status: "completed",
    output_text: "",
    output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
  }));
  await assert.rejects(() => p.confirmDomain(INPUT), InvalidDomainConfirmationResponseError);
});

test("provider error → DomainConfirmationError (no raw output / company leak)", async () => {
  const p = provider(async () => {
    throw new Error("raw openai internal detail");
  });
  await assert.rejects(
    () => p.confirmDomain(INPUT),
    (e: unknown) => {
      assert.ok(e instanceof DomainConfirmationError);
      assert.ok(!e.publicMessage.includes("raw openai internal detail"));
      assert.ok(!e.publicMessage.includes("przykladowa"));
      return true;
    },
  );
});

// (9) timeout signal is used
test("timeout signal is used → DomainConfirmationTimeoutError", async () => {
  const hanging: CreateConfirmationResponseFn = (_params, opts) =>
    new Promise((_resolve, reject) => {
      const s = opts.signal;
      if (s?.aborted) {
        reject(s.reason ?? new DOMException("aborted", "AbortError"));
        return;
      }
      s?.addEventListener("abort", () => reject(s.reason ?? new DOMException("aborted", "AbortError")));
    });
  const p = provider(hanging, 20);
  await assert.rejects(() => p.confirmDomain(INPUT), DomainConfirmationTimeoutError);
});
