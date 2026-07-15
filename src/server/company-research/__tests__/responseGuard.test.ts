import { test } from "node:test";
import assert from "node:assert/strict";
import { guardAndValidateResponse } from "../responseGuard.ts";
import { CompanyResearchInternalError } from "../errors.ts";
import { buildCompletedResponse } from "../mappers/toDashboardResponse.ts";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { fakeKrsExtract } from "./krsFixture.ts";
import type { NormalizedQuery } from "../types.ts";
import type { CompletedResponse } from "../../../contracts/companyResearch.ts";

const query: NormalizedQuery = { name: "Przykładowa", countryCode: "PL", krs: "0000123456" };
const company = sanitizeKrsResponse(fakeKrsExtract, "0000123456", "2026-07-14T10:00:00.000Z");

function validCompleted(): CompletedResponse {
  return buildCompletedResponse({
    requestId: "req-1",
    query,
    company,
    version: "test",
    researchedAt: "2026-07-14T10:00:00.000Z",
  });
}

/** Cast helper to tamper with an object without using `any`. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

test("passes a valid completed response through unchanged", () => {
  const ok = validCompleted();
  const result = guardAndValidateResponse(ok);
  assert.equal(result.status, "completed");
});

test("rejects a personal field injected into a source", () => {
  const bad = validCompleted();
  asRecord(bad.sources[0]).boardMembers = [{ nazwisko: "X" }];
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

test("rejects a personal field injected into quality/warnings area", () => {
  const bad = validCompleted();
  asRecord(bad.quality).ownerName = "somebody";
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

test("rejects a personal field injected into expansionInputs", () => {
  const bad = validCompleted();
  asRecord(bad.expansionInputs).shareholderPesel = "12345678901";
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

test("rejects an off-contract shape (strict schema)", () => {
  const bad = validCompleted();
  asRecord(bad).extraTopLevel = true;
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});
