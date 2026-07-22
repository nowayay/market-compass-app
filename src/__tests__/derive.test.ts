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

test("(dashboard rendering) a better rank (lower index) maps to a higher-or-equal tier and a distinct map-fill color from a worse rank", () => {
  const best = decorateCountry(country({ score: 90 }), 0); // rank 1
  const worst = decorateCountry(country({ score: 20 }), 14); // rank 15
  assert.equal(best.mapFill, mapFillOf(1));
  assert.equal(worst.mapFill, mapFillOf(15));
  assert.notEqual(best.tierColor, worst.tierColor);
});

test("(dashboard rendering) tierOf groups ranks into the documented three bands (1-5, 6-10, 11-15)", () => {
  assert.equal(tierOf(1).label, "Wysoki potencjał");
  assert.equal(tierOf(5).label, "Wysoki potencjał");
  assert.equal(tierOf(6).label, "Średni potencjał");
  assert.equal(tierOf(10).label, "Średni potencjał");
  assert.equal(tierOf(11).label, "Niski potencjał");
  assert.equal(tierOf(15).label, "Niski potencjał");
});

test("(dashboard rendering) decorateCountry assigns tier colors matching the 1-5 green / 6-10 orange / 11-15 red rank groups", () => {
  const rank1 = decorateCountry(country(), 0);
  const rank5 = decorateCountry(country(), 4);
  const rank6 = decorateCountry(country(), 5);
  const rank10 = decorateCountry(country(), 9);
  const rank11 = decorateCountry(country(), 10);
  const rank15 = decorateCountry(country(), 14);
  assert.equal(rank1.tierColor, "#16A34A");
  assert.equal(rank5.tierColor, "#16A34A");
  assert.equal(rank6.tierColor, "#F59E0B");
  assert.equal(rank10.tierColor, "#F59E0B");
  assert.equal(rank11.tierColor, "#EF4444");
  assert.equal(rank15.tierColor, "#EF4444");
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
