import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_DISCOVERED_CANDIDATES,
  parseDiscoveryOutput,
} from "../identification/discoverySchema.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { InvalidIdentificationResponseError } from "../errors.ts";

test("normalizes KRS to 10 digits and maps allowed fields only", () => {
  const result = parseDiscoveryOutput({
    candidates: [{ legalName: "Alfa", krs: "123456", city: "Kraków", foundedYear: 2010 }],
  });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], {
    legalName: "Alfa",
    krs: "0000123456",
    city: "Kraków",
    countryCode: "PL",
    foundedYear: 2010,
  });
});

test("accepts a JSON string payload", () => {
  const result = parseDiscoveryOutput('{"candidates":[{"legalName":"Beta","krs":"0000000001"}]}');
  assert.equal(result[0].krs, "0000000001");
});

test("throws on non-JSON string (invalid structured output)", () => {
  assert.throws(() => parseDiscoveryOutput("<<<not json>>>"), InvalidIdentificationResponseError);
});

test("throws when the candidates array is missing", () => {
  assert.throws(() => parseDiscoveryOutput({ foo: 1 }), InvalidIdentificationResponseError);
  assert.throws(() => parseDiscoveryOutput(42), InvalidIdentificationResponseError);
});

test("drops candidates with an invalid KRS", () => {
  const result = parseDiscoveryOutput({
    candidates: [
      { legalName: "Bad1", krs: "not-a-number" },
      { legalName: "Bad2", krs: "00001234567" }, // 11 digits
      { legalName: "Good", krs: "0000000009" },
    ],
  });
  assert.deepEqual(result.map((c) => c.legalName), ["Good"]);
});

test("deduplicates candidates by normalized KRS", () => {
  const result = parseDiscoveryOutput({
    candidates: [
      { legalName: "Alfa", krs: "123456" },
      { legalName: "Alfa duplicate", krs: "0000123456" },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].legalName, "Alfa");
});

test("caps the result at MAX_DISCOVERED_CANDIDATES", () => {
  const candidates = Array.from({ length: 8 }, (_, i) => ({
    legalName: `C${i}`,
    krs: String(i + 1).padStart(10, "0"),
  }));
  assert.equal(parseDiscoveryOutput({ candidates }).length, MAX_DISCOVERED_CANDIDATES);
});

test("does not include website or sources (removed from the model schema)", () => {
  const result = parseDiscoveryOutput({
    candidates: [{ legalName: "Alfa", krs: "0000123456", website: "https://alfa.pl", sourceUrls: ["https://x"] }],
  });
  const keys = Object.keys(result[0]).sort();
  assert.deepEqual(keys, ["city", "countryCode", "foundedYear", "krs", "legalName"]);
});

test("never surfaces natural-person data from the raw output", () => {
  const result = parseDiscoveryOutput({
    candidates: [
      {
        legalName: "Alfa",
        krs: "0000123456",
        boardMembers: [{ nazwisko: "Kowalski", imie: "Jan", pesel: "00000000000" }],
        ceoName: "Jan Kowalski",
      },
    ],
  });
  const serialized = JSON.stringify(result);
  for (const needle of ["Kowalski", "Jan", "pesel", "00000000000", "ceoName", "boardMembers"]) {
    assert.ok(!serialized.includes(needle), `leaked: ${needle}`);
  }
  assert.doesNotThrow(() => assertNoPersonalData(result, "discovered"));
});
