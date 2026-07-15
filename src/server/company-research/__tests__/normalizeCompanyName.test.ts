import { test } from "node:test";
import assert from "node:assert/strict";
import {
  companyNameTokens,
  nameMatchScore,
  normalizeCompanyName,
} from "../identification/normalizeCompanyName.ts";

test("folds diacritics, lowercases and strips legal-form tokens", () => {
  assert.equal(normalizeCompanyName("Przykładowa Spółka z o.o."), "przykladowa");
  assert.equal(normalizeCompanyName("ACME S.A."), "acme");
  assert.equal(normalizeCompanyName("Łódzka Firma Handlowa"), "lodzka handlowa");
});

test("tokenizes to significant tokens only", () => {
  assert.deepEqual(companyNameTokens("Przykładowa Spółka Akcyjna"), ["przykladowa"]);
  assert.deepEqual(companyNameTokens("  "), []);
});

test("nameMatchScore is 1 for an exact normalized match", () => {
  assert.equal(nameMatchScore("Przykładowa Sp. z o.o.", "PRZYKŁADOWA SPÓŁKA Z O.O."), 1);
});

test("nameMatchScore is 0 for disjoint names", () => {
  assert.equal(nameMatchScore("Alfa Handel", "Beta Produkcja"), 0);
});

test("nameMatchScore is a fractional Jaccard for partial overlap", () => {
  // tokens {alfa, handel} vs {alfa, produkcja} → 1/3
  const score = nameMatchScore("Alfa Handel", "Alfa Produkcja");
  assert.ok(score > 0 && score < 1, String(score));
  assert.equal(score, Number((1 / 3).toFixed(4)));
});

test("empty / stopword-only names score 0", () => {
  assert.equal(nameMatchScore("Sp. z o.o.", "Przykładowa"), 0);
});
