import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOMAIN_CONFIRMATION_JSON_SCHEMA,
  MAX_IDENTIFIER_VALUES,
  normalizeFoundIdentifiers,
  normalizeFoundKrsValue,
  parseConfirmationOutput,
} from "../domain-confirmation/schema.ts";
import { normalizeKrsValue } from "../domain-evaluation/normalizeDomainSignals.ts";
import { InvalidDomainConfirmationResponseError } from "../domain-confirmation/errors.ts";

const schema = DOMAIN_CONFIRMATION_JSON_SCHEMA as {
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, { type: string; maxItems?: number; items?: { type: string } }>;
};

// (10) strict schema rejects unknown fields
test("schema is strict: additionalProperties false, all three fields required", () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(
    schema.required.slice().sort(),
    ["foundKrsValues", "foundNipValues", "foundRegonValues"],
  );
});

// (13) no person fields in the schema
test("schema exposes ONLY the three identifier arrays (no person/URL/flag fields)", () => {
  assert.deepEqual(
    Object.keys(schema.properties).sort(),
    ["foundKrsValues", "foundNipValues", "foundRegonValues"],
  );
  const dump = JSON.stringify(schema);
  for (const forbidden of [
    "evidenceUrl",
    "url",
    "name",
    "email",
    "phone",
    "pesel",
    "person",
    "confidence",
    "verified",
    "confirmed",
    "title",
    "snippet",
    "description",
  ]) {
    assert.ok(!dump.includes(forbidden), `schema exposes forbidden field: ${forbidden}`);
  }
});

// (11) maximum 3 values per identifier array (schema level)
test("schema caps each identifier array at MAX_IDENTIFIER_VALUES", () => {
  assert.equal(MAX_IDENTIFIER_VALUES, 3);
  for (const key of ["foundKrsValues", "foundNipValues", "foundRegonValues"]) {
    assert.equal(schema.properties[key].maxItems, 3);
    assert.equal(schema.properties[key].items?.type, "string");
  }
});

// (14) empty arrays accepted
test("empty arrays parse and normalize to empty (no malformed)", () => {
  const raw = parseConfirmationOutput({
    foundKrsValues: [],
    foundNipValues: [],
    foundRegonValues: [],
  });
  const found = normalizeFoundIdentifiers(raw);
  assert.deepEqual(found.krs, []);
  assert.deepEqual(found.nip, []);
  assert.deepEqual(found.regon, []);
  assert.equal(found.malformedKrs, false);
  assert.equal(found.malformedNip, false);
  assert.equal(found.malformedRegon, false);
});

// (12) model-returned URL field is rejected / dropped
test("an extra evidenceUrl field is dropped and never survives parsing", () => {
  const raw = parseConfirmationOutput({
    foundKrsValues: ["0000123456"],
    foundNipValues: [],
    foundRegonValues: [],
    evidenceUrl: "https://evil.example/leak",
  } as unknown);
  const dump = JSON.stringify(raw);
  assert.ok(!dump.includes("evidenceUrl"));
  assert.ok(!dump.includes("evil.example"));
  assert.ok(!dump.includes("https://"));
});

// (11 runtime) cap at 3 during parsing
test("parsing caps identifier arrays at three values", () => {
  const raw = parseConfirmationOutput({
    foundKrsValues: ["1", "2", "3", "4", "5"],
    foundNipValues: [],
    foundRegonValues: [],
  });
  assert.equal(raw.krs.length, 3);
});

test("non-string and empty values are ignored during parsing", () => {
  const raw = parseConfirmationOutput({
    foundNipValues: ["1234563218", "", 42, null, "  "],
    foundKrsValues: [],
    foundRegonValues: [],
  } as unknown);
  assert.deepEqual(raw.nip, ["1234563218"]);
});

test("invalid (non-object) output throws InvalidDomainConfirmationResponseError", () => {
  assert.throws(() => parseConfirmationOutput("not json {"), InvalidDomainConfirmationResponseError);
  assert.throws(() => parseConfirmationOutput(JSON.stringify([1, 2, 3])), InvalidDomainConfirmationResponseError);
});

// (F) normalization: strict, deduplicated, malformed flags
test("normalization deduplicates and normalizes valid identifiers", () => {
  const found = normalizeFoundIdentifiers({
    krs: ["0000123456", "0000-123-456"], // both normalize to 0000123456 (exact 10)
    nip: ["PL 123-456-32-18", "1234563218"], // both normalize to 1234563218
    regon: ["123456785", "12345678512347"], // 9- and 14-digit both valid
  });
  assert.deepEqual(found.krs, ["0000123456"]);
  assert.deepEqual(found.nip, ["1234563218"]);
  assert.deepEqual(found.regon, ["123456785", "12345678512347"]);
});

test("malformed values set the malformed flag and are excluded", () => {
  const found = normalizeFoundIdentifiers({
    krs: ["not-a-krs"],
    nip: ["12345"], // wrong length
    regon: ["abc123"],
  });
  assert.deepEqual(found.krs, []);
  assert.deepEqual(found.nip, []);
  assert.deepEqual(found.regon, []);
  assert.equal(found.malformedKrs, true);
  assert.equal(found.malformedNip, true);
  assert.equal(found.malformedRegon, true);
});

// --- Evidence-oriented found-KRS normalization (no left-padding) -------------

test("expected backend KRS still normalizes per the existing input policy (pads)", () => {
  // Requirement 2: the trusted, input-oriented normalizer keeps its padding
  // behavior for the EXPECTED company KRS from the backend.
  assert.equal(normalizeKrsValue("123456"), "0000123456");
  assert.equal(normalizeKrsValue("1"), "0000000001");
});

test("found KRS is accepted only as an EXACT 10-digit value (never padded)", () => {
  assert.equal(normalizeFoundKrsValue("0000123456"), "0000123456");
  // spaces and hyphens inside an otherwise exact 10-digit value are allowed
  assert.equal(normalizeFoundKrsValue("0000-123-456"), "0000123456");
  assert.equal(normalizeFoundKrsValue("0000 123 456"), "0000123456");
});

test("a short found number is malformed and is NEVER padded into a KRS", () => {
  // The core safety fix: "1" must not become "0000000001".
  assert.equal(normalizeFoundKrsValue("1"), null);
  assert.equal(normalizeFoundKrsValue("123456"), null); // 6 digits
  assert.equal(normalizeFoundKrsValue("123456789"), null); // 9 digits
  assert.notEqual(normalizeFoundKrsValue("1"), normalizeKrsValue("0000000001"));
});

test("found KRS with labels, slashes or letters is rejected as malformed", () => {
  assert.equal(normalizeFoundKrsValue("KRS: 0000123456"), null);
  assert.equal(normalizeFoundKrsValue("0000/123/456"), null);
  assert.equal(normalizeFoundKrsValue("ABC0000123456"), null);
  assert.equal(normalizeFoundKrsValue("0000123456."), null);
});

test("normalizeFoundIdentifiers uses the strict found-KRS rule", () => {
  const found = normalizeFoundIdentifiers({ krs: ["1"], nip: [], regon: [] });
  assert.deepEqual(found.krs, []);
  assert.equal(found.malformedKrs, true);

  const ok = normalizeFoundIdentifiers({ krs: ["0000123456"], nip: [], regon: [] });
  assert.deepEqual(ok.krs, ["0000123456"]);
  assert.equal(ok.malformedKrs, false);
});
