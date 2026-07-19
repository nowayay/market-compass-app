/**
 * Focused MVP tests for the pure dashboard-rendering helpers: ranked-country
 * decoration (rank/tier/map-fill assignment that the ranking list and map
 * consume) and the bounded chat context builder.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decorateCountry, buildChatCompanyContext, mapFillOf, tierOf } from "../lib/derive.ts";
import type { DashboardCompletedResponse, RankedCountry } from "../types.ts";

function country(overrides: Partial<RankedCountry> = {}): RankedCountry {
  return {
    countryCode: "DE",
    countryName: "Niemcy",
    score: 80,
    summary: "Duży rynek.",
    opportunities: ["Popyt"],
    risks: ["Konkurencja"],
    ...overrides,
  };
}

test("(dashboard rendering) decorateCountry assigns a 1-based rank from its array index", () => {
  const a = decorateCountry(country({ countryCode: "DE" }), 0);
  const b = decorateCountry(country({ countryCode: "FR" }), 1);
  assert.equal(a.rank, 1);
  assert.equal(b.rank, 2);
});

test("(dashboard rendering) decorateCountry preserves every original field", () => {
  const source = country({ countryCode: "US", score: 65, opportunities: ["A", "B"], risks: ["C"] });
  const decorated = decorateCountry(source, 2);
  assert.equal(decorated.countryCode, source.countryCode);
  assert.equal(decorated.countryName, source.countryName);
  assert.equal(decorated.score, source.score);
  assert.deepEqual(decorated.opportunities, source.opportunities);
  assert.deepEqual(decorated.risks, source.risks);
});

test("(dashboard rendering) higher scores map to a higher (or equal) tier and a distinct map-fill color", () => {
  const high = decorateCountry(country({ score: 90 }), 0);
  const low = decorateCountry(country({ score: 20 }), 0);
  assert.equal(high.mapFill, mapFillOf(90));
  assert.equal(low.mapFill, mapFillOf(20));
  assert.notEqual(high.tierColor, low.tierColor);
});

test("(dashboard rendering) tierOf is monotonic across the documented score bands", () => {
  assert.equal(tierOf(85).label, "Bardzo wysoki");
  assert.equal(tierOf(65).label, "Wysoki");
  assert.equal(tierOf(50).label, "Średni");
  assert.equal(tierOf(10).label, "Bardzo niski");
});

function fakeDashboard(): DashboardCompletedResponse {
  return {
    status: "completed",
    requestId: "req_1",
    query: { name: "Test Sp. z o.o.", countryCode: "PL" },
    company: {
      legalName: "Test Sp. z o.o.",
      krs: "0000123456",
      industry: "Oprogramowanie",
      description: "Firma tworzy oprogramowanie na zamówienie.",
      productsServices: ["Aplikacje webowe"],
      customerSegments: ["MŚP"],
      operatingMarkets: ["Polska"],
    },
    expansion: {
      swot: {
        strengths: ["Silny zespół"],
        weaknesses: ["Mały budżet"],
        opportunities: ["Rosnący popyt"],
        threats: ["Konkurencja"],
      },
      rankedCountries: [country({ countryCode: "DE" }), country({ countryCode: "FR", score: 70 })],
    },
    sources: [],
  };
}

test("(chat context) buildChatCompanyContext produces valid, parseable JSON with the expected fields", () => {
  const json = buildChatCompanyContext(fakeDashboard());
  const parsed = JSON.parse(json);
  assert.equal(parsed.company.legalName, "Test Sp. z o.o.");
  assert.equal(parsed.rankedCountries.length, 2);
  assert.deepEqual(Object.keys(parsed.swot).sort(), ["opportunities", "strengths", "threats", "weaknesses"]);
  // Never leaks fields beyond the bounded summary (e.g. no raw `sources`/`query`).
  assert.deepEqual(Object.keys(parsed).sort(), ["company", "rankedCountries", "swot"]);
});

test("(chat context) buildChatCompanyContext is bounded in length", () => {
  const huge = fakeDashboard();
  huge.company.description = "x".repeat(20000);
  const json = buildChatCompanyContext(huge);
  assert.ok(json.length <= 4000);
});
