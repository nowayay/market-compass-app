import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoPersonalData,
  PersonalDataLeakError,
} from "../privacy/assertNoPersonalData.ts";
import { buildDomainDiscoveryInput } from "../domain-discovery/buildDomainDiscoveryInput.ts";
import { extractDomainCandidates } from "../domain-discovery/extractDomainCandidates.ts";
import {
  DOMAIN_DISCOVERY_JSON_SCHEMA,
  parseDomainDiscoveryOutput,
} from "../domain-discovery/schema.ts";
import type { RawDomainCandidate } from "../domain-discovery/schema.ts";
import type { SafeDiscoveredSource } from "../identification/webSourceSecurity.ts";
import type { KrsCompany } from "../types.ts";

// A legal name that WOULD trip the role-plus-name heuristic (mixed case).
const PERSON_LIKE_LEGAL_NAME = "Prezes Jan Kowalski Spółka z o.o.";

const code = (c: string) => (e: unknown) =>
  e instanceof PersonalDataLeakError && e.code === c;

const NO_SIGNALS = {
  matchedLegalName: null,
  matchedKrs: null,
  matchedNip: null,
  matchedRegon: null,
  matchedCity: null,
};

// --- 1. discovery INPUT legalName accepts a legal person-like name ----------
test("discovery input legalName accepts a legal person-like company name", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData({ legalName: PERSON_LIKE_LEGAL_NAME }, "domainDiscoveryInput"),
  );
  // And the same through the real allowlisted input object.
  const company: KrsCompany = {
    krs: "0000123456",
    legalName: PERSON_LIKE_LEGAL_NAME,
    countryCode: "PL",
    pkdSecondaryCodes: [],
    pkdLabels: [],
    retrievedAt: "2026-07-14T10:00:00.000Z",
  };
  assert.doesNotThrow(() =>
    assertNoPersonalData(buildDomainDiscoveryInput(company), "domainDiscoveryInput"),
  );
});

// --- 2. matchedLegalName accepts a legal person-like name -------------------
test("matchedLegalName accepts a legal person-like company name (schema stage)", () => {
  assert.doesNotThrow(() =>
    parseDomainDiscoveryOutput({
      candidates: [
        { url: "https://c.example/x", matchedLegalName: PERSON_LIKE_LEGAL_NAME, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null },
      ],
    }),
  );
});

test("matchedLegalName accepts a legal person-like name (candidate result)", () => {
  const raw: RawDomainCandidate[] = [
    { url: "https://c.example/o-nas", signals: { ...NO_SIGNALS, matchedLegalName: PERSON_LIKE_LEGAL_NAME } },
  ];
  const attested: SafeDiscoveredSource[] = [{ origin: "https://c.example", hostname: "c.example" }];
  const result = extractDomainCandidates(raw, attested);
  assert.equal(result.length, 1);
  assert.equal(result[0].signals.matchedLegalName, PERSON_LIKE_LEGAL_NAME);
});

// --- 3. the SAME phrase in a normal business text field IS rejected ---------
test("the same role+name phrase is rejected in a normal business text field", () => {
  assert.throws(
    () => assertNoPersonalData({ business: { description: "Prezes Jan Kowalski" } }, "response"),
    code("PERSON_ROLE_PHRASE"),
  );
  // And in a non-legal-name discovery signal (matchedCity).
  assert.throws(
    () =>
      parseDomainDiscoveryOutput({
        candidates: [
          { url: "https://c.example/x", matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: "Prezes Jan Kowalski" },
        ],
      }),
    code("PERSON_ROLE_PHRASE"),
  );
});

// --- 4. arbitrary `name` / `matchedLegalName` keys do NOT gain exemption ----
test("arbitrary fields are not exempted (path-specific only)", () => {
  // A generic `name` key.
  assert.throws(
    () => assertNoPersonalData({ contact: { name: "Prezes Jan Kowalski" } }, "response"),
    code("PERSON_ROLE_PHRASE"),
  );
  // A `matchedLegalName` NOT under an approved structural path (parent redacts).
  assert.throws(
    () => assertNoPersonalData({ notes: { matchedLegalName: "Prezes Jan Kowalski" } }, "response"),
    code("PERSON_ROLE_PHRASE"),
  );
});

// --- 5. direct identifier protections stay active on legal-name paths -------
test("email / phone / PESEL / profile URL are still rejected on legal-name paths", () => {
  assert.throws(
    () => assertNoPersonalData({ legalName: "kontakt biuro@ukryta.example" }, "domainDiscoveryInput"),
    code("EMAIL_ADDRESS"),
  );
  assert.throws(
    () => assertNoPersonalData({ legalName: "zadzwoń 123 456 789" }, "domainDiscoveryInput"),
    code("PHONE_NUMBER"),
  );
  assert.throws(
    () => assertNoPersonalData({ legalName: "12345678901" }, "domainDiscoveryInput"),
    code("PESEL"),
  );
  assert.throws(
    () => assertNoPersonalData({ signals: { matchedLegalName: "https://www.linkedin.com/in/jan-kowalski" } }, "domainCandidates"),
    code("PERSONAL_PROFILE_URL"),
  );
});

// --- 6. structured output schema exposes no natural-person fields -----------
test("the structured output schema introduces no natural-person fields", () => {
  const props = DOMAIN_DISCOVERY_JSON_SCHEMA.properties as Record<string, Record<string, unknown>>;
  const item = props.candidates.items as Record<string, unknown>;
  const itemProps = item.properties as Record<string, unknown>;
  assert.deepEqual(Object.keys(itemProps).sort(), [
    "matchedCity", "matchedKrs", "matchedLegalName", "matchedNip", "matchedRegon", "url",
  ]);
  const dump = JSON.stringify(DOMAIN_DISCOVERY_JSON_SCHEMA).toLowerCase();
  for (const forbidden of ["board", "owner", "employee", "founder", "representative", "contact", "person", "shareholder", "email", "phone"]) {
    assert.ok(!dump.includes(forbidden), `schema mentions a person field: ${forbidden}`);
  }
});
