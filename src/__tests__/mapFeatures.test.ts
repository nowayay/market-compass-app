/**
 * Focused MVP tests for the ranking-to-map mapping: matching AI-ranked
 * countries (ISO alpha-2) against world-atlas outlines (ISO alpha-3), which
 * drives which countries the interactive map highlights.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { iso2ToIso3 } from "../data/iso2to3.ts";
import { buildMapFeatures } from "../components/dashboard/mapFeatures.ts";
import { decorateCountry } from "../lib/derive.ts";
import type { RankedCountry, WorldFeature } from "../types.ts";

test("(map mapping) iso2ToIso3 converts known codes and is case-insensitive", () => {
  assert.equal(iso2ToIso3("DE"), "DEU");
  assert.equal(iso2ToIso3("de"), "DEU");
  assert.equal(iso2ToIso3("PL"), "POL");
  assert.equal(iso2ToIso3("US"), "USA");
});

test("(map mapping) iso2ToIso3 returns null for an unknown code", () => {
  assert.equal(iso2ToIso3("ZZ"), null);
});

function country(countryCode: string, score: number): RankedCountry {
  return { countryCode, countryName: countryCode, score, summary: "", opportunities: [], risks: [] };
}

test("(map mapping) buildMapFeatures highlights exactly the outlines matching a ranked country", () => {
  const worldFeatures: WorldFeature[] = [
    { iso3: "DEU", d: "M0 0" },
    { iso3: "FRA", d: "M1 1" },
    { iso3: "ESP", d: "M2 2" }, // unranked
  ];
  const countries = [country("DE", 80), country("FR", 60)].map(decorateCountry);
  const features = buildMapFeatures(worldFeatures, countries);

  const de = features.find((f) => f.iso3 === "DEU");
  const fr = features.find((f) => f.iso3 === "FRA");
  const es = features.find((f) => f.iso3 === "ESP");

  assert.equal(de?.countryCode, "DE");
  assert.equal(fr?.countryCode, "FR");
  assert.equal(es?.countryCode, null);
  assert.notEqual(de?.fill, "#D1D5DB");
  assert.equal(es?.fill, "#D1D5DB");
});

test("(map mapping) buildMapFeatures gives a higher-scoring country a fill distinct from the unranked default", () => {
  const worldFeatures: WorldFeature[] = [{ iso3: "USA", d: "M0 0" }];
  const countries = [country("US", 90)].map(decorateCountry);
  const [feature] = buildMapFeatures(worldFeatures, countries);
  assert.equal(feature.cursor, "pointer");
  assert.notEqual(feature.fill, "#D1D5DB");
});

test("(map mapping) an outline with no matching ranked country falls back to the neutral fill and default cursor", () => {
  const worldFeatures: WorldFeature[] = [{ iso3: "BRA", d: "M0 0" }];
  const features = buildMapFeatures(worldFeatures, []);
  assert.equal(features[0].fill, "#D1D5DB");
  assert.equal(features[0].cursor, "default");
  assert.equal(features[0].countryCode, null);
});
