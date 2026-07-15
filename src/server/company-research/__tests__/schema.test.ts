import { test } from "node:test";
import assert from "node:assert/strict";
import { companyResearchRequestSchema } from "../schema.ts";

test("valid request parses and defaults countryCode to PL", () => {
  const parsed = companyResearchRequestSchema.safeParse({
    query: { name: "Example Company" },
    selectedCandidateId: null,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.query.countryCode, "PL");
    assert.equal(parsed.data.query.name, "Example Company");
  }
});

test("query is required", () => {
  assert.equal(companyResearchRequestSchema.safeParse({}).success, false);
});

test("empty / whitespace name is rejected", () => {
  assert.equal(
    companyResearchRequestSchema.safeParse({ query: { name: "   " } }).success,
    false,
  );
});

test("unrealistic foundedYear is rejected", () => {
  assert.equal(
    companyResearchRequestSchema.safeParse({ query: { name: "X", foundedYear: 1200 } }).success,
    false,
  );
  assert.equal(
    companyResearchRequestSchema.safeParse({ query: { name: "X", foundedYear: 3000 } }).success,
    false,
  );
});

test("unknown properties are rejected (strict objects)", () => {
  assert.equal(
    companyResearchRequestSchema.safeParse({ query: { name: "X" }, hacker: true }).success,
    false,
  );
  assert.equal(
    companyResearchRequestSchema.safeParse({ query: { name: "X", secret: 1 } }).success,
    false,
  );
});

test("countryCode is normalized to uppercase", () => {
  const parsed = companyResearchRequestSchema.safeParse({ query: { name: "X", countryCode: "pl" } });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.query.countryCode, "PL");
});
