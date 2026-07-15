import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEntityType, identifyCompany } from "../resolution/identifyCompany.ts";
import {
  buildNotFoundResponse,
  buildUnsupportedResponse,
} from "../mappers/toDashboardResponse.ts";
import { errorHttpStatus, providerHttpStatus } from "../errors.ts";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { fakeKrsExtract } from "./krsFixture.ts";
import type { CompanyDataProvider, KrsCompany, NormalizedQuery } from "../types.ts";

const baseQuery: NormalizedQuery = { name: "Example", countryCode: "PL", krs: "0000123456" };

function providerReturning(company: KrsCompany | null): CompanyDataProvider {
  return { name: "fake", async fetchByKrs() { return company; } };
}
function providerThrowing(error: unknown): CompanyDataProvider {
  return { name: "fake", async fetchByKrs() { throw error; } };
}

const supportedCompany = sanitizeKrsResponse(fakeKrsExtract, "0000123456", "2026-07-14T10:00:00.000Z");

test("classifyEntityType flags natural-person businesses", () => {
  assert.equal(classifyEntityType("SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ"), "supported");
  assert.equal(classifyEntityType("PRZEDSIĘBIORSTWO OSOBY FIZYCZNEJ"), "natural_person_business");
  assert.equal(classifyEntityType(undefined), "supported");
});

test("identify returns found for a supported company (completed path)", async () => {
  const result = await identifyCompany(baseQuery, providerReturning(supportedCompany));
  assert.equal(result.kind, "found");
});

test("identify returns not_found when the provider has no match", async () => {
  const result = await identifyCompany(baseQuery, providerReturning(null));
  assert.equal(result.kind, "not_found");
});

test("identify returns not_found for a name-only query (no KRS)", async () => {
  const result = await identifyCompany(
    { name: "Example", countryCode: "PL" },
    providerReturning(supportedCompany),
  );
  assert.equal(result.kind, "not_found");
});

test("identify returns unsupported for a natural-person business", async () => {
  const natural: KrsCompany = { ...supportedCompany, legalForm: "OSOBA FIZYCZNA PROWADZĄCA DZIAŁALNOŚĆ" };
  const result = await identifyCompany(baseQuery, providerReturning(natural));
  assert.equal(result.kind, "unsupported");
  if (result.kind === "unsupported") assert.equal(result.reason, "natural_person_business");
});

test("identify propagates a provider error", async () => {
  const err = new Error("boom");
  await assert.rejects(() => identifyCompany(baseQuery, providerThrowing(err)), /boom/);
});

test("not_found and unsupported responses are well-formed", () => {
  const nf = buildNotFoundResponse({ requestId: "r", query: baseQuery });
  assert.equal(nf.status, "not_found");
  assert.equal(nf.message, "Nie znaleziono pasującego podmiotu.");

  const un = buildUnsupportedResponse({ requestId: "r", query: baseQuery, reason: "natural_person_business" });
  assert.equal(un.status, "unsupported_entity_type");
  assert.equal(un.reason, "natural_person_business");
});

test("provider-error HTTP mapping", () => {
  assert.equal(providerHttpStatus(429), 429);
  assert.equal(providerHttpStatus(503), 503);
  assert.equal(providerHttpStatus(500), 503);
  assert.equal(providerHttpStatus(undefined), 503);
  assert.equal(providerHttpStatus(401), 502);
  assert.equal(errorHttpStatus("INVALID_KRS"), 400);
  assert.equal(errorHttpStatus("COMPANY_RESEARCH_CONFIGURATION_ERROR"), 500);
});
