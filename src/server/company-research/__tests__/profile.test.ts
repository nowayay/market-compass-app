import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import {
  buildCompanyProfile,
  buildCompletedResponse,
} from "../mappers/toDashboardResponse.ts";
import { fakeKrsExtract } from "./krsFixture.ts";
import type { NormalizedQuery } from "../types.ts";

const query: NormalizedQuery = {
  name: "Przykładowa",
  countryCode: "PL",
  foundedYear: 2011,
  krs: "0000123456",
};

const company = sanitizeKrsResponse(fakeKrsExtract, "0000123456", "2026-07-14T10:00:00.000Z");

test("final CompanyProfile contains no personal data", () => {
  const profile = buildCompanyProfile(company, query);
  assert.doesNotThrow(() => assertNoPersonalData(profile, "company"));
  assert.equal(profile.identity.legalName, "PRZYKŁADOWA SPÓŁKA SP. Z O.O.");
  assert.equal(profile.identity.foundedYear, 2011);
  assert.equal(profile.location.city, "WARSZAWA");
  assert.equal(profile.website.verified, false);
  // No management/owners/etc. sections exist on the profile at all.
  assert.deepEqual(Object.keys(profile).sort(), [
    "business",
    "identity",
    "industry",
    "location",
    "website",
  ]);
});

test("completed response is well-formed and personal-data free", () => {
  const response = buildCompletedResponse({
    requestId: "req-1",
    query,
    company,
    version: "test",
    researchedAt: "2026-07-14T10:00:00.000Z",
  });
  assert.equal(response.status, "completed");
  assert.equal(response.requestId, "req-1");
  assert.equal(response.query.krs, "0000123456");
  assert.equal(response.sources[0].provider, "krs");
  assert.equal(response.sources[0].authority, "primary");
  assert.equal(response.quality.identityConfidence.level, "high");
  assert.doesNotThrow(() => assertNoPersonalData(response, "response"));
});
