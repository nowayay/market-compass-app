/**
 * Focused tests for the OpenAI expansion-analysis provider:
 * - the localization requirement (MarketCompass MVP: generated analysis
 *   content defaults to Polish),
 * - the single-automatic-retry behavior on a structural validation failure
 *   (fewer than 15 countries, duplicate codes, an unsupported code), including
 *   that a retry never re-issues more than one extra call, that the retry
 *   instructions are short and corrective (never echoing raw prior output),
 *   and that the same company input is reused unchanged across attempts (no
 *   company research is ever re-run to produce a retry).
 * `expansionAnalysisSchema.test.ts` already covers the response-parsing
 * invariants themselves and is left untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type OpenAI from "openai";
import { createOpenAiExpansionAnalysisProvider } from "../expansion-analysis/createOpenAiExpansionAnalysisProvider.ts";
import type {
  CreateResponseFn,
  OpenAiExpansionAnalysisDeps,
} from "../expansion-analysis/createOpenAiExpansionAnalysisProvider.ts";
import type { ExpansionAnalysisInput } from "../expansion-analysis/types.ts";
import { InvalidExpansionAnalysisResponseError } from "../errors.ts";

const INPUT: ExpansionAnalysisInput = {
  legalName: "Przykładowa Spółka Sp. z o.o.",
  countryCode: "PL",
  productsServices: [],
  customerSegments: [],
  operatingMarkets: [],
};

const FIFTEEN_CODES = ["DE", "FR", "US", "GB", "NL", "PL", "BR", "ES", "IT", "SE", "CZ", "AT", "CH", "CA", "JP"];

function validSwot() {
  return {
    strengths: ["Silna marka", "Dobra jakość produktów", "Elastyczny zespół"],
    weaknesses: ["Mały zespół", "Ograniczony budżet", "Brak biura za granicą"],
    opportunities: ["Rosnący popyt", "Nowe kanały online", "Wsparcie eksportowe"],
    threats: ["Silna konkurencja", "Ryzyko walutowe", "Zmiany regulacyjne"],
  };
}

function outputWithCodes(codes: string[]) {
  return {
    swot: validSwot(),
    rankedCountries: codes.map((code, i) => ({
      countryCode: code,
      countryName: `Kraj ${code}`,
      score: 95 - i * 5,
      summary: `Podsumowanie dla ${code}.`,
      opportunities: ["Szansa 1"],
      risks: ["Ryzyko 1"],
    })),
  };
}

function validOutput() {
  return outputWithCodes(FIFTEEN_CODES);
}

function completedResponse(output: unknown) {
  return { status: "completed", output_text: JSON.stringify(output), output: [] };
}

function provider(createResponse: CreateResponseFn) {
  const deps: OpenAiExpansionAnalysisDeps = { createResponse, model: "test-model", timeoutMs: 5000, maxOutputTokens: 6000 };
  return createOpenAiExpansionAnalysisProvider(deps);
}

/** Builds a `createResponse` fake that returns each response in order, one per call. */
function scriptedCreateResponse(
  responses: unknown[],
): { fn: CreateResponseFn; calls: OpenAI.Responses.ResponseCreateParamsNonStreaming[] } {
  const calls: OpenAI.Responses.ResponseCreateParamsNonStreaming[] = [];
  const fn: CreateResponseFn = async (params) => {
    calls.push(params);
    return responses[calls.length - 1];
  };
  return { fn, calls };
}

// (localization) MarketCompass MVP: generated expansion analysis must default to Polish
test("the instructions require Polish for SWOT/summary/opportunities/risks/countryName, keeping countryCode as an unchanged ISO code", async () => {
  let capturedInstructions = "";
  const p = provider(async (params) => {
    capturedInstructions = params.instructions ?? "";
    return completedResponse(validOutput());
  });
  await p.analyze(INPUT);

  assert.ok(capturedInstructions.includes("Write every human-readable field in Polish"));
  assert.ok(capturedInstructions.includes("SWOT bullets"));
  assert.ok(capturedInstructions.includes("summary, opportunities and risks"));
  assert.ok(capturedInstructions.includes("countryName MUST be the Polish name"));
  assert.ok(capturedInstructions.includes("Niemcy"));
  assert.ok(capturedInstructions.includes("Korea Południowa"));
  assert.ok(capturedInstructions.includes("countryCode stays an unchanged, untranslated ISO 3166-1 alpha-2 code"));
});

test("(retry) a first response that fails validation is retried once and succeeds on the second attempt", async () => {
  const { fn, calls } = scriptedCreateResponse([
    completedResponse(outputWithCodes(FIFTEEN_CODES.slice(0, 14))), // fewer than 15 — invalid
    completedResponse(validOutput()),
  ]);
  const result = await provider(fn).analyze(INPUT);

  assert.equal(calls.length, 2);
  assert.equal(result.rankedCountries.length, 15);
  // The retry call carries a short corrective instruction, on top of the base rules.
  assert.ok(calls[1].instructions?.includes("Your previous response did not satisfy the required structure"));
  assert.ok(calls[1].instructions?.includes("EXACTLY 15 ranked countries"));
  // The same company input is reused unchanged — no company research is re-run for a retry.
  assert.equal(calls[0].input, calls[1].input);
});

test("(retry) when both attempts fail validation, the existing safe error is returned after exactly two calls (no third attempt)", async () => {
  const { fn, calls } = scriptedCreateResponse([
    completedResponse(outputWithCodes(FIFTEEN_CODES.slice(0, 14))),
    completedResponse(outputWithCodes(FIFTEEN_CODES.slice(0, 14))),
  ]);

  await assert.rejects(() => provider(fn).analyze(INPUT), InvalidExpansionAnalysisResponseError);
  assert.equal(calls.length, 2);
});

test("(retry) fewer than 15 countries on the first attempt is retried and can succeed", async () => {
  const { fn, calls } = scriptedCreateResponse([
    completedResponse(outputWithCodes(FIFTEEN_CODES.slice(0, 10))), // only 10 countries
    completedResponse(validOutput()),
  ]);
  const result = await provider(fn).analyze(INPUT);
  assert.equal(calls.length, 2);
  assert.equal(result.rankedCountries.length, 15);
});

test("(retry) duplicate country codes on the first attempt is retried and can succeed", async () => {
  const withDuplicate = [...FIFTEEN_CODES.slice(0, 14), FIFTEEN_CODES[0]]; // DE appears twice
  const { fn, calls } = scriptedCreateResponse([
    completedResponse(outputWithCodes(withDuplicate)),
    completedResponse(validOutput()),
  ]);
  const result = await provider(fn).analyze(INPUT);
  assert.equal(calls.length, 2);
  assert.equal(new Set(result.rankedCountries.map((c) => c.countryCode)).size, 15);
});

test("(retry) an unsupported country code on the first attempt is retried and can succeed", async () => {
  const withBadCode = [...FIFTEEN_CODES.slice(0, 14), "ZZ"];
  const { fn, calls } = scriptedCreateResponse([
    completedResponse(outputWithCodes(withBadCode)),
    completedResponse(validOutput()),
  ]);
  const result = await provider(fn).analyze(INPUT);
  assert.equal(calls.length, 2);
  for (const country of result.rankedCountries) {
    assert.notEqual(country.countryCode, "ZZ");
  }
});

test("(retry) a duplicate code on both attempts is rejected, never silently deduped or repaired", async () => {
  const withDuplicate = [...FIFTEEN_CODES.slice(0, 14), FIFTEEN_CODES[0]];
  const { fn, calls } = scriptedCreateResponse([
    completedResponse(outputWithCodes(withDuplicate)),
    completedResponse(outputWithCodes(withDuplicate)),
  ]);
  await assert.rejects(() => provider(fn).analyze(INPUT), InvalidExpansionAnalysisResponseError);
  assert.equal(calls.length, 2);
});

test("(retry) a network/transport failure on the first attempt is never retried by this mechanism", async () => {
  let callCount = 0;
  const fn: CreateResponseFn = async () => {
    callCount++;
    throw new Error("network down");
  };
  await assert.rejects(() => provider(fn).analyze(INPUT));
  assert.equal(callCount, 1);
});
