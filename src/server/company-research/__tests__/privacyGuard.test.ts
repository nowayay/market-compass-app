import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoPersonalData,
  PersonalDataLeakError,
} from "../privacy/assertNoPersonalData.ts";
import { handleCompanyResearch } from "../httpHandler.ts";
import type { CompanyResearchDeps } from "../researchCompany.ts";
import { createIdentificationBudget } from "../identification/identificationBudget.ts";
import type { KrsCompany } from "../types.ts";

// ---------------------------------------------------------------------------
// A. Forbidden keys are rejected (token-aware, all casings).
// ---------------------------------------------------------------------------
test("A: explicit natural-person keys are rejected", () => {
  const forbidden = [
    "boardMember", "board_member", "management-member", "owner", "founder",
    "employee", "representative", "proxy", "contactPerson", "firstName",
    "last_name", "personName", "personalEmail", "personalPhone", "biography",
    "nazwisko", "zarzad", "prokurent", "wspolnik", "beneficialOwner",
  ];
  for (const key of forbidden) {
    assert.throws(
      () => assertNoPersonalData({ [key]: "x" }, "response"),
      (e: unknown) => e instanceof PersonalDataLeakError && e.code === "FORBIDDEN_KEY",
      `expected ${key} to be rejected`,
    );
  }
});

// ---------------------------------------------------------------------------
// B. Legitimate keys / values are NOT rejected (no substring false positives).
// ---------------------------------------------------------------------------
test("B: substring-collision keys are accepted", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { dashboard: {}, keyboard: 1, personalization: true, personCount: 5, boardroomArea: "x" },
      "response",
    ),
  );
});

test("B: legal-entity names resembling a person are accepted", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData({ identity: { legalName: "Jan Kowalski Transport Sp. z o.o." } }, "response"),
  );
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { candidates: [{ legalName: "Anna Nowak Consulting Sp. z o.o.", identifiers: { krs: "0000123456" } }] },
      "response",
    ),
  );
  assert.doesNotThrow(() =>
    assertNoPersonalData({ identity: { legalName: "Kowalski i Nowak Spółka Jawna" } }, "response"),
  );
});

test("B: valid identifiers, dates and ids are not treated as phone numbers", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { identifiers: { krs: "0000123456", nip: "1234563218", regon: "123456785" } },
      "response",
    ),
  );
  assert.doesNotThrow(() =>
    assertNoPersonalData({ query: { krs: "0000123456" } }, "response"),
  );
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { retrievedAt: "2026-07-14T10:00:00.000Z", registrationDate: "2011-01-01", foundedYear: 2011 },
      "response",
    ),
  );
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      {
        requestId: "550e8400-e29b-41d4-a716-446655440000",
        sources: [{ id: "src_krs_0000123456" }],
        evidence: { facts: [{ id: "fev_x", sourceIds: ["src_krs_0000123456"] }] },
      },
      "response",
    ),
  );
});

// ---------------------------------------------------------------------------
// C. Forbidden VALUES are rejected in ordinary (non-allowlisted) fields.
// ---------------------------------------------------------------------------
const inText = (value: string): unknown => ({ business: { description: value } });

test("C: contact info and personal identifiers in text are rejected", () => {
  const cases: Array<[string, string]> = [
    ["jan.kowalski@example.com", "EMAIL_ADDRESS"],
    ["Zadzwoń: 123 456 789", "PHONE_NUMBER"],
    ["+48 601 234 567", "PHONE_NUMBER"],
    ["PESEL 12345678901", "PESEL"],
  ];
  for (const [value, code] of cases) {
    assert.throws(
      () => assertNoPersonalData(inText(value), "response"),
      (e: unknown) => e instanceof PersonalDataLeakError && e.code === code,
      `expected ${value} → ${code}`,
    );
  }
});

test("C: role + person-name phrases (PL/EN) are rejected", () => {
  for (const value of [
    "CEO Jan Kowalski",
    "Założyciel: Jan Kowalski",
    "Kontakt: Anna Nowak",
    "member of the board John Smith",
    "Prezes: Łukasz Nowak",
  ]) {
    assert.throws(
      () => assertNoPersonalData(inText(value), "response"),
      (e: unknown) => e instanceof PersonalDataLeakError && e.code === "PERSON_ROLE_PHRASE",
      `expected role phrase rejected: ${value}`,
    );
  }
});

test("C: personal social-media profile URLs are rejected", () => {
  for (const value of [
    "https://www.linkedin.com/in/jan-kowalski",
    "https://linkedin.com/pub/jan-kowalski",
    "https://facebook.com/profile.php?id=100001",
    "https://x.com/@jan_kowalski",
    "https://twitter.com/@jan_kowalski",
  ]) {
    assert.throws(
      () => assertNoPersonalData(inText(value), "response"),
      (e: unknown) => e instanceof PersonalDataLeakError && e.code === "PERSONAL_PROFILE_URL",
      `expected profile URL rejected: ${value}`,
    );
  }
});

// ---------------------------------------------------------------------------
// D. Safe business/company values are accepted.
// ---------------------------------------------------------------------------
test("D: safe company/business values are accepted", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      {
        business: {
          productsServices: ["Meble biurowe", "Krzesła ergonomiczne"],
          description: "Producent mebli biurowych i foteli.",
        },
        location: { city: "Kraków", region: "Małopolskie", countryCode: "PL" },
        identity: { legalForm: "Spółka z ograniczoną odpowiedzialnością" },
        industry: { labels: ["Produkcja mebli", "Sprzedaż detaliczna"] },
        sources: [{ url: "https://nordicfurniture.example", domain: "nordicfurniture.example" }],
      },
      "response",
    ),
  );
});

test("D: a bare company social platform origin is not rejected", () => {
  // Only clearly-personal profile paths are blocked; a company origin is fine.
  assert.doesNotThrow(() =>
    assertNoPersonalData({ sources: [{ url: "https://linkedin.com", domain: "linkedin.com" }] }, "response"),
  );
});

// ---------------------------------------------------------------------------
// E. Error safety — no rejected raw value in errors or logs.
// ---------------------------------------------------------------------------
test("E: the thrown privacy error never contains the rejected value", () => {
  const secret = "jan.kowalski@example.com";
  try {
    assertNoPersonalData({ business: { description: secret } }, "response");
    assert.fail("expected a PersonalDataLeakError");
  } catch (e) {
    assert.ok(e instanceof PersonalDataLeakError);
    assert.equal(e.code, "EMAIL_ADDRESS");
    assert.equal(e.path, "response.business.description");
    assert.ok(!e.message.includes(secret), "message leaked the value");
    assert.ok(!e.message.includes("kowalski"), "message leaked part of the value");
    const serialized = JSON.stringify({ message: e.message, code: e.code, path: e.path });
    assert.ok(!serialized.includes("kowalski"), "serialized error leaked the value");
  }
});

test("E: a privacy failure yields a generic HTTP 500 and leaks nothing to body or logs", async () => {
  const secret = "info@ukryta-osoba.example";
  // A KRS provider that (hypothetically) returns a leaky legal name; the final
  // server gate must reject it and surface only a generic error.
  const leaky: KrsCompany = {
    krs: "0000123456",
    legalName: `${secret} Sp. z o.o.`,
    countryCode: "PL",
    pkdSecondaryCodes: [],
    pkdLabels: [],
    retrievedAt: "2026-07-14T10:00:00.000Z",
  };
  const deps: CompanyResearchDeps = {
    krsProvider: { name: "fake-krs", async fetchByKrs() { return leaky; } },
    identificationProvider: { name: "fake-ident", async discoverCandidates() { return { candidates: [], sources: [] }; } },
    identificationBudget: createIdentificationBudget({ enabled: false, windowMs: 1000, maxPerWindow: 1, maxConcurrent: 1 }),
  };

  const logLines: string[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => { logLines.push(args.map((a) => String(a)).join(" ")); };

  let bodyText: string;
  let statusCode: number;
  try {
    const res = await handleCompanyResearch(
      new Request("http://x/api/company-research", {
        method: "POST",
        body: JSON.stringify({ query: { name: "X", krs: "0000123456" } }),
      }),
      deps,
    );
    statusCode = res.status;
    bodyText = await res.text();
  } finally {
    console.info = originalInfo;
  }

  assert.equal(statusCode, 500);
  const body = JSON.parse(bodyText) as { error: { code: string; message: string } };
  assert.equal(body.error.code, "COMPANY_RESEARCH_INTERNAL_ERROR");
  assert.ok(!bodyText.includes(secret), "HTTP body leaked the value");
  assert.ok(!bodyText.includes("ukryta"), "HTTP body leaked part of the value");
  const logs = logLines.join("\n");
  assert.ok(!logs.includes(secret), "logs leaked the value");
  assert.ok(!logs.includes("ukryta"), "logs leaked part of the value");
  // The technical log line is still present (metadata only).
  assert.ok(logs.includes("COMPANY_RESEARCH_INTERNAL_ERROR"));
});
