/**
 * Tests for the OpenAI country-details provider core: maxRetries: 0 on every
 * call, the single schema-correction retry (and only that), no retry after a
 * timeout, and clean timeout / caller-abort mapping.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAiCountryDetailsProvider } from "../countryDetails/createOpenAiCountryDetailsProvider.ts";
import type {
  CreateResponseFn,
  OpenAiCountryDetailsDeps,
} from "../countryDetails/createOpenAiCountryDetailsProvider.ts";
import type { CountryDetailsInput } from "../countryDetails/types.ts";
import { CountryDetailsError, CountryDetailsTimeoutError, InvalidCountryDetailsResponseError } from "../countryDetails/errors.ts";

const INPUT: CountryDetailsInput = {
  company: { legalName: "Przykład Sp. z o.o.", productsServices: [], customerSegments: [], operatingMarkets: [] },
  country: { countryCode: "DE", countryName: "Niemcy", score: 88 },
};

function validOutput() {
  return {
    scoreRationale: "Uzasadnienie.",
    opportunities: ["a", "b", "c", "d"],
    risks: ["e", "f", "g", "h"],
    customerSegments: ["s1", "s2", "s3"],
    competition: "Konkurencja.",
    entryModel: "Model.",
    barriers: ["b1", "b2", "b3"],
    firstSteps: ["k1", "k2", "k3"],
    confidenceLevel: "high",
    confidenceRationale: "Bo tak.",
  };
}

function completed(output: unknown) {
  return { status: "completed", output_text: JSON.stringify(output), output: [] };
}

function provider(createResponse: CreateResponseFn, timeoutMs = 5000) {
  const deps: OpenAiCountryDetailsDeps = { createResponse, model: "test-model", timeoutMs, maxOutputTokens: 2000 };
  return createOpenAiCountryDetailsProvider(deps);
}

test("(country details) a valid first response returns without a retry", async () => {
  let calls = 0;
  const result = await provider(async () => {
    calls++;
    return completed(validOutput());
  }).generate(INPUT);
  assert.equal(calls, 1);
  assert.equal(result.opportunities.length, 4);
});

test("(country details) every OpenAI call is issued with maxRetries: 0", async () => {
  const seen: number[] = [];
  await provider(async (_p, options) => {
    seen.push(options.maxRetries);
    return completed(validOutput());
  }).generate(INPUT);
  assert.deepEqual(seen, [0]);
});

test("(country details) an invalid first response is retried once and can succeed", async () => {
  const responses = [completed({ ...validOutput(), opportunities: ["too", "few"] }), completed(validOutput())];
  let calls = 0;
  const result = await provider(async () => responses[calls++]).generate(INPUT);
  assert.equal(calls, 2);
  assert.equal(result.opportunities.length, 4);
});

test("(country details) two invalid responses fail after exactly two calls (no third)", async () => {
  let calls = 0;
  await assert.rejects(
    () => provider(async () => { calls++; return completed({ ...validOutput(), risks: ["one"] }); }).generate(INPUT),
    InvalidCountryDetailsResponseError,
  );
  assert.equal(calls, 2);
});

test("(country details) a transport failure is never retried and maps to CountryDetailsError", async () => {
  let calls = 0;
  await assert.rejects(
    () => provider(async () => { calls++; throw new Error("network down"); }).generate(INPUT),
    CountryDetailsError,
  );
  assert.equal(calls, 1);
});

test("(country details) a call that outlives the timeout throws CountryDetailsTimeoutError, not retried", async () => {
  let calls = 0;
  const fn: CreateResponseFn = (_p, options) => {
    calls++;
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  await assert.rejects(() => provider(fn, 20).generate(INPUT), CountryDetailsTimeoutError);
  assert.equal(calls, 1);
});
