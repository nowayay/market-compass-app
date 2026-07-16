import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDomainConfirmationInput,
  buildExpectedIdentifiers,
} from "../domain-confirmation/buildDomainConfirmationInput.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import type { KrsCompany } from "../types.ts";

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "PRZYKŁADOWA SP. Z O.O.",
  legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  nip: "1234563218",
  regon: "123456785",
  registrationDate: "2011-01-01",
  city: "Warszawa",
  region: "Mazowieckie",
  countryCode: "PL",
  pkdPrimaryCode: "62.01.Z",
  pkdSecondaryCodes: [],
  pkdLabels: ["Działalność związana z oprogramowaniem"],
  registerType: "P",
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

const TARGET = { origin: "https://przykladowa.example", domain: "przykladowa.example" };

// (1) input contains legalName / location / domain
test("input carries only legal name, coarse location and the target", () => {
  const input = buildDomainConfirmationInput(COMPANY, TARGET);
  assert.deepEqual(Object.keys(input).sort(), [
    "city",
    "countryCode",
    "legalName",
    "region",
    "targetDomain",
    "targetOrigin",
  ]);
  assert.equal(input.legalName, "PRZYKŁADOWA SP. Z O.O.");
  assert.equal(input.city, "Warszawa");
  assert.equal(input.region, "Mazowieckie");
  assert.equal(input.countryCode, "PL");
  assert.equal(input.targetDomain, "przykladowa.example");
  assert.equal(input.targetOrigin, "https://przykladowa.example");
});

// (2) input does not contain KRS / NIP / REGON fields
test("input has NO identifier fields and no raw KRS payload fields", () => {
  const input = buildDomainConfirmationInput(COMPANY, TARGET) as unknown as Record<string, unknown>;
  for (const forbidden of [
    "krs",
    "nip",
    "regon",
    "pkdPrimaryCode",
    "pkdLabels",
    "registerType",
    "retrievedAt",
    "address",
    "street",
  ]) {
    assert.ok(!(forbidden in input), `leaked field: ${forbidden}`);
  }
});

test("serialized input contains none of the expected identifier values", () => {
  const serialized = JSON.stringify(buildDomainConfirmationInput(COMPANY, TARGET));
  assert.ok(!serialized.includes(COMPANY.krs));
  assert.ok(!serialized.includes(COMPANY.nip as string));
  assert.ok(!serialized.includes(COMPANY.regon as string));
});

test("null coarse-location fields are preserved as null (no leakage)", () => {
  const input = buildDomainConfirmationInput(
    { ...COMPANY, city: undefined, region: undefined },
    TARGET,
  );
  assert.equal(input.city, null);
  assert.equal(input.region, null);
});

test("buildExpectedIdentifiers is a SEPARATE object (never the provider input)", () => {
  const expected = buildExpectedIdentifiers(COMPANY);
  assert.deepEqual(expected, { krs: "0000123456", nip: "1234563218", regon: "123456785" });
  // The provider input builder never returns these.
  const input = buildDomainConfirmationInput(COMPANY, TARGET) as unknown as Record<string, unknown>;
  assert.ok(!("krs" in input) && !("nip" in input) && !("regon" in input));
});

test("input passes the personal-data guard (legal name allowed on its path)", () => {
  const input = buildDomainConfirmationInput(COMPANY, TARGET);
  assert.doesNotThrow(() => assertNoPersonalData(input, "domainConfirmationInput"));
});
