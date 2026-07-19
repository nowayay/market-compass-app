import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmSelectedCandidate } from "../identification/confirmSelectedCandidate.ts";
import { CandidateNotFoundError, InvalidCandidateIdError } from "../errors.ts";
import type { CompanyDataProvider, KrsCompany, NormalizedQuery } from "../types.ts";

const CTX = { requestId: "req-1", version: "test", researchedAt: "2026-07-15T10:00:00.000Z" };
const ID = "cmp_pl_krs_0000123456";

function krsCompany(legalName: string): KrsCompany {
  return { krs: "0000123456", legalName, countryCode: "PL", pkdSecondaryCodes: [], pkdLabels: [], retrievedAt: CTX.researchedAt };
}

function krsProvider(company: KrsCompany | null): CompanyDataProvider {
  return { name: "fake-krs", async fetchByKrs() { return company; } };
}

const query = (name: string): NormalizedQuery => ({ name, countryCode: "PL" });

test("exact name → completed", async () => {
  const res = await confirmSelectedCandidate(ID, query("Przykładowa"), krsProvider(krsCompany("PRZYKŁADOWA SPÓŁKA SP. Z O.O.")), CTX);
  assert.equal(res.status, "completed");
});

test("name without the legal form (sp. z o.o.) → completed", async () => {
  const res = await confirmSelectedCandidate(ID, query("Przykładowa Sp. z o.o."), krsProvider(krsCompany("Przykładowa")), CTX);
  assert.equal(res.status, "completed");
});

// A candidate returned in `needs_confirmation` was, by definition, already
// weakly/partially name-matched — confirming it must still succeed, since a
// human explicitly picked it from the returned list. Re-running the same
// text-similarity score here would make legitimately returned candidates
// unselectable, which is exactly the bug this flow must never reintroduce.
test("one shared token but an otherwise different-looking company → still completed (weak match is never re-checked)", async () => {
  const res = await confirmSelectedCandidate(ID, query("Alfa Handel"), krsProvider(krsCompany("Alfa Produkcja")), CTX);
  assert.equal(res.status, "completed");
});

test("a completely different name from the query → still completed (weak match is never re-checked)", async () => {
  const res = await confirmSelectedCandidate(ID, query("Zupełnie Inna"), krsProvider(krsCompany("Alfa Beta")), CTX);
  assert.equal(res.status, "completed");
});

test("picking any valid, KRS-verified candidate → completed regardless of how it compares to the query text", async () => {
  const res = await confirmSelectedCandidate(ID, query("Moja Firma"), krsProvider(krsCompany("Zupełnie Losowa Spółka")), CTX);
  assert.equal(res.status, "completed");
});

test("case, whitespace and legal-form differences between the query and the registry name never block a selection", async () => {
  const res = await confirmSelectedCandidate(
    ID,
    query("   pRzYkŁaDoWa   "),
    krsProvider(krsCompany("Przykładowa Spółka Akcyjna")),
    CTX,
  );
  assert.equal(res.status, "completed");
});

test("invalid candidateId → InvalidCandidateIdError", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate("cmp_de_krs_0000123456", query("Alfa"), krsProvider(krsCompany("Alfa")), CTX),
    InvalidCandidateIdError,
  );
});

test("an unknown candidateId (not a well-formed id at all) → InvalidCandidateIdError", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate("not-a-candidate-id", query("Alfa"), krsProvider(krsCompany("Alfa")), CTX),
    InvalidCandidateIdError,
  );
});

test("KRS not found (candidate id points outside any real registry entity) → CandidateNotFoundError", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate(ID, query("Alfa"), krsProvider(null), CTX),
    CandidateNotFoundError,
  );
});
