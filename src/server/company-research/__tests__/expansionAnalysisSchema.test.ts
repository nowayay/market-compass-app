/**
 * Focused MVP tests for the expansion-analysis Structured Output parser:
 * the expansion result schema shape, the "exactly 5 distinct countries"
 * invariant, sort-by-score enforcement, and the SWOT bullet-count bounds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExpansionAnalysisOutput } from "../expansion-analysis/schema.ts";
import { InvalidExpansionAnalysisResponseError } from "../errors.ts";
import { iso2ToIso3 } from "../../../data/iso2to3.ts";

function validSwot() {
  return {
    strengths: ["Silna marka", "Dobra jakość produktów", "Elastyczny zespół"],
    weaknesses: ["Mały zespół", "Ograniczony budżet", "Brak biura za granicą"],
    opportunities: ["Rosnący popyt", "Nowe kanały online", "Wsparcie eksportowe"],
    threats: ["Silna konkurencja", "Ryzyko walutowe", "Zmiany regulacyjne"],
  };
}

function validCountry(countryCode: string, score: number) {
  return {
    countryCode,
    countryName: `Kraj ${countryCode}`,
    score,
    summary: `Podsumowanie dla ${countryCode}.`,
    opportunities: ["Szansa 1"],
    risks: ["Ryzyko 1"],
  };
}

function validOutput(scores: number[] = [90, 80, 70, 60, 50]) {
  return {
    swot: validSwot(),
    rankedCountries: ["DE", "FR", "US", "GB", "NL"].map((code, i) => validCountry(code, scores[i])),
  };
}

test("(expansion schema) a genuinely valid output parses into the expected shape", () => {
  const result = parseExpansionAnalysisOutput(JSON.stringify(validOutput()));
  assert.equal(result.rankedCountries.length, 5);
  assert.deepEqual(Object.keys(result.swot).sort(), ["opportunities", "strengths", "threats", "weaknesses"]);
  assert.deepEqual(
    result.rankedCountries.map((c) => c.countryCode),
    ["DE", "FR", "US", "GB", "NL"],
  );
});

test("(expansion schema) exactly 5 distinct countries is enforced — fewer than 5 is rejected", () => {
  const bad = validOutput();
  bad.rankedCountries = bad.rankedCountries.slice(0, 4);
  assert.throws(() => parseExpansionAnalysisOutput(bad), InvalidExpansionAnalysisResponseError);
});

test("(expansion schema) more than 5 countries is rejected", () => {
  const bad = validOutput();
  bad.rankedCountries.push(validCountry("PL", 40));
  assert.throws(() => parseExpansionAnalysisOutput(bad), InvalidExpansionAnalysisResponseError);
});

test("(expansion schema) a duplicate country code is rejected", () => {
  const bad = validOutput();
  bad.rankedCountries[4] = { ...bad.rankedCountries[4], countryCode: bad.rankedCountries[0].countryCode };
  assert.throws(() => parseExpansionAnalysisOutput(bad), InvalidExpansionAnalysisResponseError);
});

test("(expansion schema) a non 2-letter country code is rejected", () => {
  const bad = validOutput();
  bad.rankedCountries[0] = { ...bad.rankedCountries[0], countryCode: "DEU" };
  assert.throws(() => parseExpansionAnalysisOutput(bad), InvalidExpansionAnalysisResponseError);
});

test("(expansion schema) a two-letter code that is not a real supported country is rejected", () => {
  for (const invalidCode of ["ZZ", "XX", "AA", "QZ"]) {
    const bad = validOutput();
    bad.rankedCountries[0] = { ...bad.rankedCountries[0], countryCode: invalidCode };
    assert.throws(
      () => parseExpansionAnalysisOutput(bad),
      InvalidExpansionAnalysisResponseError,
      `expected ${invalidCode} to be rejected`,
    );
  }
});

test("(expansion schema) five real supported country codes are accepted", () => {
  const result = parseExpansionAnalysisOutput(
    JSON.stringify({
      swot: validSwot(),
      rankedCountries: ["PL", "DE", "FR", "US", "BR"].map((code, i) => validCountry(code, 90 - i * 10)),
    }),
  );
  assert.deepEqual(
    result.rankedCountries.map((c) => c.countryCode).sort(),
    ["BR", "DE", "FR", "PL", "US"],
  );
});

test("(expansion schema) every accepted country code maps to an alpha-3 atlas code", () => {
  const result = parseExpansionAnalysisOutput(JSON.stringify(validOutput()));
  for (const country of result.rankedCountries) {
    assert.notEqual(iso2ToIso3(country.countryCode), null, `${country.countryCode} must map to alpha-3`);
  }
});

test("(expansion schema) countries are always returned sorted by score descending, regardless of input order, without changing score values", () => {
  const unsorted = validOutput([10, 90, 50, 30, 70]); // DE=10, FR=90, US=50, GB=30, NL=70
  const result = parseExpansionAnalysisOutput(unsorted);
  const scores = result.rankedCountries.map((c) => c.score);
  const sorted = [...scores].sort((a, b) => b - a);
  assert.deepEqual(scores, sorted);
  assert.deepEqual(scores, [90, 70, 50, 30, 10]);
  assert.equal(result.rankedCountries[0].countryCode, "FR");
});

test("(expansion schema) a score below zero is rejected, never clamped", () => {
  for (const score of [-1, -20]) {
    const bad = validOutput();
    bad.rankedCountries[0] = { ...bad.rankedCountries[0], score };
    assert.throws(
      () => parseExpansionAnalysisOutput(bad),
      InvalidExpansionAnalysisResponseError,
      `expected score ${score} to be rejected`,
    );
  }
});

test("(expansion schema) a score above 100 is rejected, never clamped", () => {
  for (const score of [101, 140]) {
    const bad = validOutput();
    bad.rankedCountries[0] = { ...bad.rankedCountries[0], score };
    assert.throws(
      () => parseExpansionAnalysisOutput(bad),
      InvalidExpansionAnalysisResponseError,
      `expected score ${score} to be rejected`,
    );
  }
});

test("(expansion schema) boundary scores 0 and 100 are accepted unchanged", () => {
  const out = validOutput();
  out.rankedCountries[0] = { ...out.rankedCountries[0], score: 0 };
  out.rankedCountries[1] = { ...out.rankedCountries[1], score: 100 };
  const result = parseExpansionAnalysisOutput(out);
  const byCode = new Map(result.rankedCountries.map((c) => [c.countryCode, c.score]));
  assert.equal(byCode.get(out.rankedCountries[0].countryCode), 0);
  assert.equal(byCode.get(out.rankedCountries[1].countryCode), 100);
});

test("(expansion schema) NaN and Infinity scores are rejected", () => {
  for (const score of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const bad = validOutput();
    bad.rankedCountries[0] = { ...bad.rankedCountries[0], score };
    assert.throws(() => parseExpansionAnalysisOutput(bad), InvalidExpansionAnalysisResponseError);
  }
});

test("(expansion schema) a SWOT category with fewer than 3 bullets is rejected", () => {
  const bad = validOutput();
  bad.swot.weaknesses = ["Tylko jedna słabość"];
  assert.throws(() => parseExpansionAnalysisOutput(bad), InvalidExpansionAnalysisResponseError);
});

test("(expansion schema) a SWOT category with more than 5 bullets is bounded to 5", () => {
  const out = validOutput();
  out.swot.strengths = ["A", "B", "C", "D", "E", "F", "G"];
  const result = parseExpansionAnalysisOutput(out);
  assert.equal(result.swot.strengths.length, 5);
});

test("(expansion schema) malformed JSON is rejected", () => {
  assert.throws(() => parseExpansionAnalysisOutput("{not valid json"), InvalidExpansionAnalysisResponseError);
});

test("(expansion schema) missing required top-level fields are rejected", () => {
  assert.throws(() => parseExpansionAnalysisOutput({ swot: validSwot() }), InvalidExpansionAnalysisResponseError);
});
