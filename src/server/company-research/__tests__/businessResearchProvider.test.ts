import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_RESEARCH_MAX_RETRIES,
  createOpenAiBusinessResearchProvider,
} from "../business-research/createOpenAiBusinessResearchProvider.ts";
import type {
  BusinessResearchCreateParams,
  CreateBusinessResponseFn,
} from "../business-research/createOpenAiBusinessResearchProvider.ts";
import { buildBusinessResearchInput } from "../business-research/buildBusinessResearchInput.ts";
import {
  BusinessResearchError,
  BusinessResearchTimeoutError,
  InvalidBusinessResearchResponseError,
} from "../business-research/errors.ts";
import type { KrsCompany } from "../types.ts";

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "PRZYKŁADOWA SP. Z O.O.",
  legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  nip: "1234563218",
  regon: "123456785",
  city: "Warszawa",
  region: "Mazowieckie",
  countryCode: "PL",
  pkdPrimaryCode: "62.01.Z",
  pkdSecondaryCodes: ["47.91.Z"],
  pkdLabels: ["Działalność związana z oprogramowaniem"],
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

const INPUT = buildBusinessResearchInput(COMPANY, {
  targetOrigin: "https://przyklad.example",
  targetDomain: "przyklad.example",
});

function provider(createResponse: CreateBusinessResponseFn, timeoutMs = 5000) {
  return createOpenAiBusinessResearchProvider({
    createResponse,
    model: "test-model",
    timeoutMs,
    maxOutputTokens: 1800,
    maxToolCalls: 3,
  });
}

function facts(o: Record<string, unknown> = {}) {
  return {
    industryDescription: null,
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
    ambiguityCodes: [],
    ...o,
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

test("sends exactly one domain-restricted web-search + strict Structured-Output request", async () => {
  let calls = 0;
  let capturedParams: BusinessResearchCreateParams | null = null;
  let capturedOptions: { signal?: AbortSignal; maxRetries: number } | null = null;
  const p = provider(async (params, options) => {
    calls += 1;
    capturedParams = params;
    capturedOptions = options;
    return successResponse(facts());
  });
  await p.researchBusiness(INPUT);

  assert.equal(calls, 1); // (8) one OpenAI request maximum
  assert.ok(capturedParams);
  const params = capturedParams as unknown as BusinessResearchCreateParams;

  const tool = (params.tools ?? [])[0] as ToolWithFilters;
  assert.equal(tool.type, "web_search"); // (9)
  assert.equal(params.tool_choice, "required");
  assert.ok((params.include ?? []).includes("web_search_call.action.sources"));
  // (13) allowed_domains contains only exact target + apex/www counterpart
  assert.deepEqual(tool.filters?.allowed_domains, ["przyklad.example", "www.przyklad.example"]);

  const format = params.text?.format as Record<string, unknown> | undefined;
  assert.equal(format?.type, "json_schema");
  assert.equal(format?.strict, true);

  assert.equal(params.store, false); // (10)
  assert.equal(params.max_output_tokens, 1800);
  assert.equal(params.max_tool_calls, 3);

  assert.ok(capturedOptions);
  const options = capturedOptions as unknown as { signal?: AbortSignal; maxRetries: number };
  assert.equal(options.maxRetries, 0); // (11)
  assert.equal(BUSINESS_RESEARCH_MAX_RETRIES, 0);
  assert.ok(options.signal instanceof AbortSignal); // (12)
});

// (localization) MarketCompass MVP: generated business facts must default to Polish
test("the instructions require Polish for the human-readable facts and preserve names/domains untranslated", async () => {
  let capturedParams: BusinessResearchCreateParams | null = null;
  const p = provider(async (params) => {
    capturedParams = params;
    return successResponse(facts());
  });
  await p.researchBusiness(INPUT);

  const instructions = (capturedParams as unknown as { instructions: string }).instructions;
  assert.match(instructions, /Polish/);
  assert.ok(instructions.includes("industryDescription, productsServices, customerSegments and"));
  assert.ok(instructions.includes("operatingMarkets in natural, professional Polish"));
  assert.ok(instructions.toLowerCase().includes("official company name"));
  assert.ok(instructions.toLowerCase().includes("source domain"));
  assert.ok(instructions.toLowerCase().includes("trademarks"));
  assert.ok(instructions.includes("do not translate them"));
});

// (6/7) input contains only allowed fields; serialized request excludes identifiers/PKD
test("the serialized request contains only allowlisted fields and no identifiers/PKD", async () => {
  let sentInput: Record<string, unknown> | null = null;
  let serialized = "";
  const p = provider(async (params) => {
    serialized = JSON.stringify(params);
    sentInput = JSON.parse(String(params.input)) as Record<string, unknown>;
    return successResponse(facts());
  });
  await p.researchBusiness(INPUT);

  const input = sentInput as unknown as Record<string, unknown>;
  assert.deepEqual(
    Object.keys(input).sort(),
    ["city", "countryCode", "legalName", "region", "targetDomain", "targetOrigin"],
  );
  for (const forbidden of ["krs", "nip", "regon", "pkdPrimaryCode", "pkdSecondaryCodes", "pkdLabels"]) {
    assert.ok(!(forbidden in input), `leaked field: ${forbidden}`);
  }
  for (const value of [COMPANY.krs, COMPANY.nip!, COMPANY.regon!, "62.01.Z", "47.91.Z"]) {
    assert.ok(!serialized.includes(value), `leaked value: ${value}`);
  }
});

// (15/14/16/17) source extraction: on-domain accepted, off-domain + subdomain rejected, model URLs ignored
test("keeps only on-target-domain attested sources; drops off-domain/subdomain/model URLs", async () => {
  const p = provider(async () =>
    successResponse(facts({ industryDescription: "Software house" }), [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [
            { type: "url", url: "https://przyklad.example/o-nas?x=1#f" },
            { type: "url", url: "https://www.przyklad.example/oferta" },
            { type: "url", url: "https://blog.przyklad.example/post" }, // subdomain
            { type: "url", url: "https://aggregator.example/przyklad" }, // off-domain
          ],
        },
      },
    ]),
  );
  const result = await p.researchBusiness(INPUT);
  assert.deepEqual(result.sourceOrigins, ["https://przyklad.example", "https://www.przyklad.example"]);
  const dump = JSON.stringify(result.sourceOrigins);
  assert.ok(!dump.includes("/o-nas") && !dump.includes("?x=1") && !dump.includes("#f"));
  assert.ok(!dump.includes("blog.przyklad") && !dump.includes("aggregator"));
});

test("model-written URLs in output_text are never treated as sources", async () => {
  const p = provider(async () =>
    successResponse({ ...facts(), industryDescription: "See https://przyklad.example/secret" }, []),
  );
  const result = await p.researchBusiness(INPUT);
  assert.deepEqual(result.sourceOrigins, []);
});

test("incomplete / refusal / empty responses throw InvalidBusinessResearchResponseError", async () => {
  await assert.rejects(
    () => provider(async () => ({ status: "incomplete", output_text: "", output: [] })).researchBusiness(INPUT),
    InvalidBusinessResearchResponseError,
  );
  await assert.rejects(
    () =>
      provider(async () => ({
        status: "completed",
        output_text: "",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
      })).researchBusiness(INPUT),
    InvalidBusinessResearchResponseError,
  );
});

test("provider error → BusinessResearchError with no raw leak", async () => {
  const p = provider(async () => {
    throw new Error("raw openai detail przyklad");
  });
  await assert.rejects(
    () => p.researchBusiness(INPUT),
    (e: unknown) => {
      assert.ok(e instanceof BusinessResearchError);
      assert.ok(!e.publicMessage.includes("przyklad"));
      return true;
    },
  );
});

test("timeout signal is used → BusinessResearchTimeoutError", async () => {
  const hanging: CreateBusinessResponseFn = (_params, opts) =>
    new Promise((_resolve, reject) => {
      const s = opts.signal;
      if (s?.aborted) return reject(s.reason ?? new DOMException("aborted", "AbortError"));
      s?.addEventListener("abort", () => reject(s.reason ?? new DOMException("aborted", "AbortError")));
    });
  await assert.rejects(() => provider(hanging, 20).researchBusiness(INPUT), BusinessResearchTimeoutError);
});
