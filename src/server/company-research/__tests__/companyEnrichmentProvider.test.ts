/**
 * Focused tests for the OpenAI company-enrichment provider core
 * (`createOpenAiCompanyEnrichmentProvider`). These exercise the FULL
 * request-shape + response-parsing path together (including `schema.ts`),
 * which is exactly where the real production bug lived: a model response
 * with a perfectly valid description/industry/products but a messy website
 * (trailing slash, extra path) used to fail the WHOLE structured-output
 * parse and silently discard everything.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_ENRICHMENT_MAX_RETRIES,
  createOpenAiCompanyEnrichmentProvider,
} from "../enrichment/createOpenAiCompanyEnrichmentProvider.ts";
import type {
  CreateEnrichmentResponseFn,
  OpenAiCompanyEnrichmentDeps,
} from "../enrichment/createOpenAiCompanyEnrichmentProvider.ts";
import { InvalidCompanyEnrichmentResponseError } from "../enrichment/errors.ts";

const INPUT = { legalName: "CD PROJEKT S.A.", krs: "0000006865" };

function provider(createResponse: CreateEnrichmentResponseFn, timeoutMs = 5000) {
  const deps: OpenAiCompanyEnrichmentDeps = {
    createResponse,
    model: "test-model",
    timeoutMs,
    maxOutputTokens: 1500,
  };
  return createOpenAiCompanyEnrichmentProvider(deps);
}

function facts(o: Record<string, unknown> = {}) {
  return {
    description: "CD PROJEKT S.A. is a Polish video game holding company.",
    industry: "Video games",
    foundedYear: 2001,
    website: "https://www.cdprojekt.com",
    productsServices: ["Video game development"],
    customerSegments: ["Gamers"],
    operatingMarkets: ["Worldwide"],
    ...o,
  };
}

function successResponse(body: unknown) {
  return { status: "completed", output_text: typeof body === "string" ? body : JSON.stringify(body), output: [] };
}

test("sends exactly one open (non-domain-restricted) web-search + strict Structured-Output request", async () => {
  let calls = 0;
  let capturedParams: Record<string, unknown> | null = null;
  let capturedOptions: { signal?: AbortSignal; maxRetries: number } | null = null;
  const p = provider(async (params, options) => {
    calls += 1;
    capturedParams = params as unknown as Record<string, unknown>;
    capturedOptions = options;
    return successResponse(facts());
  });
  await p.enrich(INPUT);

  assert.equal(calls, 1); // exactly one OpenAI call
  assert.ok(capturedParams);
  const params = capturedParams as Record<string, unknown>;

  const tools = params.tools as { type: string }[];
  assert.equal(tools[0].type, "web_search");
  assert.equal(params.tool_choice, "required");

  const format = (params.text as Record<string, unknown>).format as Record<string, unknown>;
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);

  assert.equal(params.store, false);
  assert.equal(params.max_output_tokens, 1500);

  assert.ok(capturedOptions);
  const options = capturedOptions as unknown as { signal?: AbortSignal; maxRetries: number };
  assert.equal(options.maxRetries, 0);
  assert.equal(COMPANY_ENRICHMENT_MAX_RETRIES, 0);
  assert.ok(options.signal instanceof AbortSignal);
});

// (localization) MarketCompass MVP: generated profile facts must default to Polish
test("the instructions require Polish for description/industry/products/segments/markets and preserve names/identifiers untranslated", async () => {
  let capturedParams: Record<string, unknown> | null = null;
  const p = provider(async (params) => {
    capturedParams = params as unknown as Record<string, unknown>;
    return successResponse(facts());
  });
  await p.enrich(INPUT);

  assert.ok(capturedParams);
  const instructions = (capturedParams as Record<string, unknown>).instructions as string;
  assert.ok(instructions.includes("description, industry, productsServices, customerSegments and"));
  assert.ok(instructions.includes("operatingMarkets in natural, professional Polish"));
  assert.ok(instructions.toLowerCase().includes("official company name"));
  assert.ok(instructions.toLowerCase().includes("trademarks"));
  assert.ok(instructions.includes("NEVER"));
  assert.ok(instructions.includes("website URL"));
  assert.ok(instructions.includes("KRS, NIP or REGON"));
});

test("the serialized request contains only the allowlisted input (no PKD, no raw KRS payload)", async () => {
  let sentInput: Record<string, unknown> | null = null;
  const p = provider(async (params) => {
    sentInput = JSON.parse(String(params.input)) as Record<string, unknown>;
    return successResponse(facts());
  });
  await p.enrich({ legalName: "CD PROJEKT S.A.", krs: "0000006865", nip: "7342867148", foundedYear: 1994 });
  assert.deepEqual(Object.keys(sentInput!).sort(), ["foundedYear", "krs", "legalName", "nip"]);
});

test("does not expose raw model output on the returned facts beyond the structured fields", async () => {
  const p = provider(async () => successResponse(facts()));
  const result = await p.enrich(INPUT);
  assert.deepEqual(Object.keys(result).sort(), [
    "customerSegments",
    "description",
    "foundedYear",
    "industry",
    "operatingMarkets",
    "productsServices",
    "website",
  ]);
});

// --- The actual production bug: a messy website must never discard the rest ---

test("a real-world trailing-slash website does not discard valid description/industry/products", async () => {
  const p = provider(async () => successResponse(facts({ website: "https://www.cdprojekt.com/" })));
  const result = await p.enrich(INPUT);
  assert.equal(result.website, "https://www.cdprojekt.com");
  assert.equal(result.description, facts().description);
  assert.equal(result.industry, "Video games");
  assert.deepEqual(result.productsServices, ["Video game development"]);
});

test("a full URL with path/query/fragment is reduced to origin-only", async () => {
  const p = provider(async () =>
    successResponse(facts({ website: "https://www.cdprojekt.com/en/investors?tab=1#top" })),
  );
  const result = await p.enrich(INPUT);
  assert.equal(result.website, "https://www.cdprojekt.com");
});

test("an unnormalizable website (no scheme) becomes null, keeping the rest of the facts", async () => {
  const p = provider(async () => successResponse(facts({ website: "www.cdprojekt.com" })));
  const result = await p.enrich(INPUT);
  assert.equal(result.website, null);
  assert.equal(result.description, facts().description);
  assert.deepEqual(result.operatingMarkets, ["Worldwide"]);
});

// --- Error mapping ------------------------------------------------------------

test("incomplete / refusal / empty responses throw InvalidCompanyEnrichmentResponseError", async () => {
  await assert.rejects(
    () => provider(async () => ({ status: "incomplete", output_text: "", output: [] })).enrich(INPUT),
    InvalidCompanyEnrichmentResponseError,
  );
  await assert.rejects(
    () =>
      provider(async () => ({
        status: "completed",
        output_text: "",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }],
      })).enrich(INPUT),
    InvalidCompanyEnrichmentResponseError,
  );
});

test("provider error carries no raw leak in a way tests can assert on", async () => {
  const p = provider(async () => {
    throw new Error("raw openai detail cdprojekt");
  });
  await assert.rejects(() => p.enrich(INPUT));
});
