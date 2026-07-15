import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { fakeKrsExtract } from "./krsFixture.ts";

const RETRIEVED_AT = "2026-07-14T10:00:00.000Z";

test("maps only allowed company-as-entity fields", () => {
  const company = sanitizeKrsResponse(fakeKrsExtract, "0000123456", RETRIEVED_AT);
  assert.equal(company.krs, "0000123456");
  assert.equal(company.legalName, "PRZYKŁADOWA SPÓŁKA SP. Z O.O.");
  assert.equal(company.legalForm, "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ");
  assert.equal(company.nip, "5270000000");
  assert.equal(company.regon, "142000000");
  assert.equal(company.registrationDate, "2011.03.15");
  assert.equal(company.city, "WARSZAWA");
  assert.equal(company.region, "MAZOWIECKIE");
  assert.equal(company.countryCode, "PL");
  assert.equal(company.pkdPrimaryCode, "62.01.Z");
  assert.deepEqual(company.pkdSecondaryCodes, ["63.11.Z"]);
  assert.equal(company.registerType, "P");
});

test("does NOT copy the full street address (only city/region/country)", () => {
  const company = sanitizeKrsResponse(fakeKrsExtract, "0000123456", RETRIEVED_AT);
  const serialized = JSON.stringify(company);
  assert.ok(!serialized.includes("KWIATOWA")); // street name
  assert.ok(!serialized.includes("00-001")); // postal code
  assert.ok(!("adres" in (company as unknown as Record<string, unknown>)));
});

test("ignores dzial2 person sections entirely", () => {
  const company = sanitizeKrsResponse(fakeKrsExtract, "0000123456", RETRIEVED_AT);
  const serialized = JSON.stringify(company);
  // None of the fake person data may appear.
  for (const needle of ["KOWALSKI", "JAN", "NOWAK", "ANNA", "WIŚNIEWSKI", "PIOTR", "PREZES", "00000000000"]) {
    assert.ok(!serialized.includes(needle), `leaked: ${needle}`);
  }
  // And the regression guard must not detect any personal key.
  assert.doesNotThrow(() => assertNoPersonalData(company, "company"));
});
