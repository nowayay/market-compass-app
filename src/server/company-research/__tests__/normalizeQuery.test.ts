import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKrs, normalizeQuery } from "../resolution/normalizeQuery.ts";

test("normalizeKrs pads short numbers to exactly 10 digits", () => {
  assert.equal(normalizeKrs("123456"), "0000123456");
  assert.equal(normalizeKrs("0000123456"), "0000123456");
});

test("normalizeKrs strips spaces and dashes", () => {
  assert.equal(normalizeKrs(" 0000-123 456 "), "0000123456");
});

test("normalizeKrs rejects non-digits and overlong input", () => {
  assert.equal(normalizeKrs("12A456"), null);
  assert.equal(normalizeKrs("00001234567"), null); // 11 digits
  assert.equal(normalizeKrs(""), null);
  assert.equal(normalizeKrs("   "), null);
});

test("normalizeQuery flags an invalid KRS without throwing", () => {
  const { query, krsInvalid } = normalizeQuery({
    query: { name: "Example", countryCode: "PL", krs: "not-a-krs!" },
    selectedCandidateId: null,
  });
  assert.equal(krsInvalid, true);
  assert.equal(query.krs, undefined);
});

test("normalizeQuery normalizes a valid KRS and trims the name", () => {
  const { query, krsInvalid } = normalizeQuery({
    query: { name: "  Example  ", countryCode: "PL", foundedYear: 2010, krs: "123456" },
    selectedCandidateId: null,
  });
  assert.equal(krsInvalid, false);
  assert.equal(query.krs, "0000123456");
  assert.equal(query.name, "Example");
  assert.equal(query.foundedYear, 2010);
});
