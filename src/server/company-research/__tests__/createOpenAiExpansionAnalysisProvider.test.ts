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
import {
  ExpansionAnalysisError,
  ExpansionAnalysisTimeoutError,
  InvalidExpansionAnalysisResponseError,
} from "../errors.ts";

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
    strengths: ["Silna marka", "Dobra jakość produktów", "Elastyczny zespół", "Doświadczona kadra"],
    weaknesses: ["Mały zespół", "Ograniczony budżet", "Brak biura za granicą", "Niska rozpoznawalność"],
    opportunities: ["Rosnący popyt", "Nowe kanały online", "Wsparcie eksportowe", "Programy unijne"],
    threats: ["Silna konkurencja", "Ryzyko walutowe", "Zmiany regulacyjne", "Wahania popytu"],
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

function provider(createResponse: CreateResponseFn, timeoutMs = 5000) {
  const deps: OpenAiExpansionAnalysisDeps = { createResponse, model: "test-model", timeoutMs, maxOutputTokens: 6000 };
  return createOpenAiExpansionAnalysisProvider(deps);
}

/** Captures console.info lines, returning parsed `[company-research-stage]` payloads. */
function captureStageLogs(): { payloads: Record<string, unknown>[]; restore: () => void } {
  const original = console.info;
  const payloads: Record<string, unknown>[] = [];
  console.info = (...args: unknown[]) => {
    if (args[0] === "[company-research-stage]" && typeof args[1] === "string") {
      payloads.push(JSON.parse(args[1]) as Record<string, unknown>);
    }
  };
  return { payloads, restore: () => { console.info = original; } };
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
  await assert.rejects(() => provider(fn).analyze(INPUT), ExpansionAnalysisError);
  assert.equal(callCount, 1);
});

// (retries) transport-level auto-retries are disabled: the provider must ask
// the OpenAI client for maxRetries: 0 so a timeout/transport error is never
// silently re-issued underneath us.
test("(retries) every OpenAI call is issued with maxRetries: 0", async () => {
  const seen: number[] = [];
  const fn: CreateResponseFn = async (_params, options) => {
    seen.push(options.maxRetries);
    return completedResponse(validOutput());
  };
  await provider(fn).analyze(INPUT);
  assert.deepEqual(seen, [0]);
});

// (timeout) the stage's own AbortSignal.timeout is the cutoff; a timed-out call
// surfaces ExpansionAnalysisTimeoutError and is NEVER retried.
test("(timeout) a call that outlives the stage timeout throws ExpansionAnalysisTimeoutError and is not retried", async () => {
  let callCount = 0;
  const fn: CreateResponseFn = (_params, options) => {
    callCount++;
    return new Promise((_resolve, reject) => {
      options.signal?.addEventListener(
        "abort",
        () => reject(new Error("aborted by signal")),
        { once: true },
      );
    });
  };
  // 20ms stage timeout — the hanging call is aborted almost immediately.
  await assert.rejects(() => provider(fn, 20).analyze(INPUT), ExpansionAnalysisTimeoutError);
  assert.equal(callCount, 1);
});

// (timeout) a caller-supplied cancellation propagates untouched (not remapped
// to a timeout), and is likewise never retried.
test("(timeout) a caller abort propagates without being retried or turned into a timeout error", async () => {
  const caller = new AbortController();
  let callCount = 0;
  const fn: CreateResponseFn = (_params, options) => {
    callCount++;
    caller.abort();
    // The combined signal is already aborted synchronously here, so reject with
    // its reason directly rather than racing an 'abort' listener that missed.
    return Promise.reject(options.signal?.reason ?? new Error("aborted"));
  };
  await assert.rejects(async () => {
    await provider(fn).analyze(INPUT, { signal: caller.signal });
  });
  assert.equal(callCount, 1);
});

// (telemetry) the OpenAI-call timing line is always emitted, with `retried`
// reflecting whether the single schema-correction retry ran and a numeric
// `openAiCallMs` — and nothing sensitive.
test("(telemetry) a successful single-attempt analysis logs one openai-call line with retried=false", async () => {
  const capture = captureStageLogs();
  try {
    await provider(async () => completedResponse(validOutput())).analyze(INPUT);
  } finally {
    capture.restore();
  }
  const timing = capture.payloads.find((p) => p.status === "openai-call");
  assert.ok(timing, "expected an openai-call timing log");
  assert.equal(timing.stage, "expansion-analysis");
  assert.equal(timing.retried, false);
  assert.equal(timing.outcome, "completed");
  assert.equal(typeof timing.openAiCallMs, "number");
});

test("(telemetry) a retried analysis logs retried=true on the openai-call line", async () => {
  const { fn } = scriptedCreateResponse([
    completedResponse(outputWithCodes(FIFTEEN_CODES.slice(0, 14))),
    completedResponse(validOutput()),
  ]);
  const capture = captureStageLogs();
  try {
    await provider(fn).analyze(INPUT);
  } finally {
    capture.restore();
  }
  const timing = capture.payloads.find((p) => p.status === "openai-call");
  assert.ok(timing, "expected an openai-call timing log");
  assert.equal(timing.retried, true);
  assert.equal(timing.outcome, "completed");
});

test("(telemetry) a timed-out analysis logs outcome=timeout, retried=false", async () => {
  const fn: CreateResponseFn = (_params, options) =>
    new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  const capture = captureStageLogs();
  try {
    await assert.rejects(() => provider(fn, 20).analyze(INPUT), ExpansionAnalysisTimeoutError);
  } finally {
    capture.restore();
  }
  const timing = capture.payloads.find((p) => p.status === "openai-call");
  assert.ok(timing, "expected an openai-call timing log");
  assert.equal(timing.outcome, "timeout");
  assert.equal(timing.retried, false);
});
