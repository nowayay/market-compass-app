/**
 * Tests for the country-details Structured Output parser: the exact list
 * sizes (4 opportunities / 4 risks / 3 segments / 3 barriers / 3 first steps),
 * text truncation, confidence enum, and rejection of structurally-invalid
 * output (retryable by the provider).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCountryDetailsOutput } from "../countryDetails/schema.ts";
import { InvalidCountryDetailsResponseError } from "../countryDetails/errors.ts";
import { COUNTRY_DETAILS_MAX_TEXT } from "../../../contracts/countryDetails.ts";

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    scoreRationale: "Wysoki popyt i bliskość geograficzna uzasadniają ocenę.",
    opportunities: ["Szansa 1", "Szansa 2", "Szansa 3", "Szansa 4"],
    risks: ["Ryzyko 1", "Ryzyko 2", "Ryzyko 3", "Ryzyko 4"],
    customerSegments: ["Segment 1", "Segment 2", "Segment 3"],
    competition: "Rynek umiarkowanie konkurencyjny z kilkoma lokalnymi graczami.",
    entryModel: "Dystrybutor lokalny z opcją własnego e-commerce.",
    barriers: ["Bariera 1", "Bariera 2", "Bariera 3"],
    firstSteps: ["Krok 1", "Krok 2", "Krok 3"],
    confidenceLevel: "medium",
    confidenceRationale: "Ograniczone dane rynkowe, ale spójny profil firmy.",
    ...overrides,
  };
}

test("(country details) a valid output parses into the expected shape", () => {
  const result = parseCountryDetailsOutput(JSON.stringify(validOutput()));
  assert.equal(result.opportunities.length, 4);
  assert.equal(result.risks.length, 4);
  assert.equal(result.customerSegments.length, 3);
  assert.equal(result.barriers.length, 3);
  assert.equal(result.firstSteps.length, 3);
  assert.equal(result.confidenceLevel, "medium");
});

test("(country details) extra list items are truncated to the exact required size", () => {
  const result = parseCountryDetailsOutput(
    validOutput({
      opportunities: ["a", "b", "c", "d", "e", "f"],
      barriers: ["x", "y", "z", "w"],
    }),
  );
  assert.deepEqual(result.opportunities, ["a", "b", "c", "d"]);
  assert.deepEqual(result.barriers, ["x", "y", "z"]);
});

test("(country details) too few items in a required list is rejected", () => {
  assert.throws(
    () => parseCountryDetailsOutput(validOutput({ opportunities: ["only", "three", "items"] })),
    InvalidCountryDetailsResponseError,
  );
  assert.throws(
    () => parseCountryDetailsOutput(validOutput({ customerSegments: ["one", "two"] })),
    InvalidCountryDetailsResponseError,
  );
});

test("(country details) over-long text fields are truncated, never rejected", () => {
  const result = parseCountryDetailsOutput(validOutput({ scoreRationale: "x".repeat(1000) }));
  assert.equal(result.scoreRationale.length, COUNTRY_DETAILS_MAX_TEXT);
});

test("(country details) empty-string list items are dropped before counting", () => {
  // Two real + two blank = only two usable → below the required 4.
  assert.throws(
    () => parseCountryDetailsOutput(validOutput({ risks: ["real", "", "  ", "second"] })),
    InvalidCountryDetailsResponseError,
  );
});

test("(country details) an invalid confidence level is rejected", () => {
  assert.throws(
    () => parseCountryDetailsOutput(validOutput({ confidenceLevel: "very-high" })),
    InvalidCountryDetailsResponseError,
  );
});

test("(country details) malformed JSON is rejected", () => {
  assert.throws(() => parseCountryDetailsOutput("{not json"), InvalidCountryDetailsResponseError);
});

test("(country details) a missing required field is rejected", () => {
  const bad = validOutput();
  delete (bad as Record<string, unknown>).competition;
  assert.throws(() => parseCountryDetailsOutput(bad), InvalidCountryDetailsResponseError);
});
