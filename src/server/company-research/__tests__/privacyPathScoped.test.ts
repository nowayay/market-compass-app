import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoPersonalData,
  PersonalDataLeakError,
} from "../privacy/assertNoPersonalData.ts";
import { handleCompanyResearch } from "../httpHandler.ts";
import { createIdentificationBudget } from "../identification/identificationBudget.ts";
import type { CompanyResearchDeps } from "../researchCompany.ts";
import type { KrsCompany } from "../types.ts";

/** A company legal name that WOULD trip the role heuristic if not path-exempt. */
const ROLE_LIKE_LEGAL_NAME = "Founder Jan Kowalski Sp. z o.o.";

const isRolePhrase = (e: unknown): boolean =>
  e instanceof PersonalDataLeakError && e.code === "PERSON_ROLE_PHRASE";

// 1. A generic `name` key does NOT receive legal-entity-name treatment.
test("Fix1: an arbitrary `name` key is not legal-name exempt", () => {
  assert.throws(
    () => assertNoPersonalData({ contact: { name: ROLE_LIKE_LEGAL_NAME } }, "response"),
    isRolePhrase,
  );
  // The classic counter-example must be rejected too (if it carries a role phrase).
  assert.throws(
    () => assertNoPersonalData({ contact: { name: "Prezes: Jan Kowalski" } }, "response"),
    isRolePhrase,
  );
});

// 2. Approved company legal-name path remains accepted.
test("Fix1: company.identity.legalName remains accepted", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { company: { identity: { legalName: ROLE_LIKE_LEGAL_NAME } } },
      "response",
    ),
  );
});

// 3. Approved candidate legal-name path remains accepted.
test("Fix1: candidates[*].legalName remains accepted", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { candidates: [{ legalName: ROLE_LIKE_LEGAL_NAME }] },
      "response",
    ),
  );
});

// 4. All multi-token role forms are now rejected.
test("Fix2: multi-token role + name phrases are rejected", () => {
  const phrases = [
    "Prezes Zarządu: Jan Kowalski",
    "Członek zarządu – Anna Nowak",
    "Założyciel firmy: Adam Nowak",
    "Dyrektor sprzedaży: Jan Kowalski",
    "Chief Executive Officer: John Smith",
    "Member of the Board: Jane Smith",
    "Contact person: Jane Smith",
  ];
  for (const phrase of phrases) {
    assert.throws(
      () => assertNoPersonalData({ business: { description: phrase } }, "response"),
      isRolePhrase,
      `expected rejected: ${phrase}`,
    );
  }
});

// 5. Neutral business phrases remain accepted (no false positives).
test("Fix2: neutral business phrases remain accepted", () => {
  const phrases = [
    "oprogramowanie dla zarządu",
    "system dla dyrektora sprzedaży",
    "panel management board",
    "Chief Executive Officer software",
    "Kontakt Handlowy Warszawa",
  ];
  for (const phrase of phrases) {
    assert.doesNotThrow(
      () => assertNoPersonalData({ business: { description: phrase } }, "response"),
      `expected accepted: ${phrase}`,
    );
  }
});

// 6. A malicious / dynamic key is never reproduced in the thrown error.
test("Fix: dynamic keys and rejected values never appear in the error", () => {
  // (a) A forbidden key that embeds a person name.
  try {
    assertNoPersonalData({ business: { founderJanKowalski: "x" } }, "response");
    assert.fail("expected a PersonalDataLeakError");
  } catch (e) {
    assert.ok(e instanceof PersonalDataLeakError && e.code === "FORBIDDEN_KEY");
    assert.equal(e.path, "response.business.<redacted>");
    const dump = `${e.message} ${e.path}`;
    assert.ok(!dump.includes("founderJanKowalski"));
    assert.ok(!dump.includes("Kowalski"));
  }

  // (b) A non-forbidden dynamic key whose value violates a rule.
  const secret = "jan.kowalski@example.com";
  try {
    assertNoPersonalData({ business: { notesFromAnnaNowak: secret } }, "response");
    assert.fail("expected a PersonalDataLeakError");
  } catch (e) {
    assert.ok(e instanceof PersonalDataLeakError && e.code === "EMAIL_ADDRESS");
    assert.equal(e.path, "response.business.<redacted>");
    const dump = `${e.message} ${e.path}`;
    assert.ok(!dump.includes("AnnaNowak"));
    assert.ok(!dump.includes(secret));
    assert.ok(!dump.includes("kowalski"));
  }
});

// 7. HTTP error + metadata logs leak neither the rejected value nor a key.
test("Fix: HTTP 500 and logs leak neither the rejected value nor a dynamic key", async () => {
  const secret = "biuro@ukryta-osoba.example";
  // A KRS provider returning a legal name that carries an email (rejected even on
  // the approved legal-name path, since contact info is never allowed anywhere).
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

  let status: number;
  let bodyText: string;
  try {
    const res = await handleCompanyResearch(
      new Request("http://x/api/company-research", {
        method: "POST",
        body: JSON.stringify({ query: { name: "X", krs: "0000123456" } }),
      }),
      deps,
    );
    status = res.status;
    bodyText = await res.text();
  } finally {
    console.info = originalInfo;
  }

  assert.equal(status, 500);
  const body = JSON.parse(bodyText) as { error: { code: string; message: string } };
  assert.equal(body.error.code, "COMPANY_RESEARCH_INTERNAL_ERROR");
  const logs = logLines.join("\n");
  for (const needle of [secret, "ukryta", "osoba"]) {
    assert.ok(!bodyText.includes(needle), `body leaked: ${needle}`);
    assert.ok(!logs.includes(needle), `logs leaked: ${needle}`);
  }
  assert.ok(logs.includes("COMPANY_RESEARCH_INTERNAL_ERROR"));
});
