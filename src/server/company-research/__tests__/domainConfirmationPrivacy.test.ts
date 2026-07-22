import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import { isApprovedLegalNamePath } from "../privacy/personalDataPolicy.ts";
import { buildDomainConfirmationInput } from "../domain-confirmation/buildDomainConfirmationInput.ts";
import { evaluateDomainConfirmation } from "../domain-confirmation/evaluateDomainConfirmation.ts";
import type { KrsCompany } from "../types.ts";
import type { CompanyWebsite, CompanyResearchResponse } from "../../../contracts/companyResearch.ts";
import type { NormalizedFoundIdentifiers } from "../domain-confirmation/types.ts";

// (39) Compile-time proof the public contract was NOT extended by this stage:
// the public website shape still has only url?/domain?/verified …
const _website: CompanyWebsite = { verified: false };
void _website;
// … and no confirmation status leaked into the public response statuses.
// @ts-expect-error "confirmed" is not a public Company Research response status.
const _status: CompanyResearchResponse["status"] = "confirmed";
void _status;

const COMPANY: KrsCompany = {
  krs: "0000123456",
  // A legal name that legitimately contains a person's first name + surname.
  legalName: "Jan Kowalski Consulting Sp. z o.o.",
  nip: "1234563218",
  regon: "123456785",
  city: "Kraków",
  region: "Małopolskie",
  countryCode: "PL",
  pkdSecondaryCodes: [],
  pkdLabels: [],
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

const TARGET = { origin: "https://kowalski.example", domain: "kowalski.example" };

test("the legal-name confirmation path is an approved legal-entity-name path", () => {
  assert.ok(isApprovedLegalNamePath("domainConfirmationInput.legalName"));
  // A bare or unrelated legalName key is NOT approved.
  assert.ok(!isApprovedLegalNamePath("contact.legalName"));
});

test("a person-like legal company name is permitted on the confirmation input path", () => {
  const input = buildDomainConfirmationInput(COMPANY, TARGET);
  assert.doesNotThrow(() => assertNoPersonalData(input, "domainConfirmationInput"));
});

test("the confirmation result (identifiers + origins only) passes the privacy guard", () => {
  const found: NormalizedFoundIdentifiers = {
    krs: ["0000123456"],
    nip: ["1234563218"],
    regon: ["123456785"],
    malformedKrs: false,
    malformedNip: false,
    malformedRegon: false,
  };
  const result = evaluateDomainConfirmation(
    { krs: COMPANY.krs, nip: COMPANY.nip ?? null, regon: COMPANY.regon ?? null },
    found,
    [TARGET.origin],
    TARGET.origin,
  );
  assert.equal(result.status, "confirmed");
  assert.doesNotThrow(() => assertNoPersonalData(result, "domainConfirmationResult"));
});

test("the privacy guard still catches a smuggled person field inside the input shape", () => {
  const poisoned = {
    ...buildDomainConfirmationInput(COMPANY, TARGET),
    contactPerson: "Jan Kowalski",
  };
  assert.throws(() => assertNoPersonalData(poisoned, "domainConfirmationInput"), PersonalDataLeakError);
});
