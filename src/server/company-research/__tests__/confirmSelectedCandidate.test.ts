import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmSelectedCandidate } from "../identification/confirmSelectedCandidate.ts";
import {
  CandidateNotFoundError,
  CandidateQueryMismatchError,
  InvalidCandidateIdError,
} from "../errors.ts";
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

test("name without the legal form (sp. z o.o.) → completed (strong/exact)", async () => {
  const res = await confirmSelectedCandidate(ID, query("Przykładowa Sp. z o.o."), krsProvider(krsCompany("Przykładowa")), CTX);
  assert.equal(res.status, "completed");
});

test("one shared token but a different company → CANDIDATE_QUERY_MISMATCH (weak)", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate(ID, query("Alfa Handel"), krsProvider(krsCompany("Alfa Produkcja")), CTX),
    CandidateQueryMismatchError,
  );
});

test("completely different name → CANDIDATE_QUERY_MISMATCH", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate(ID, query("Zupełnie Inna"), krsProvider(krsCompany("Alfa Beta")), CTX),
    CandidateQueryMismatchError,
  );
});

test("picking an arbitrary valid KRS that does not match the query → rejected", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate(ID, query("Moja Firma"), krsProvider(krsCompany("Zupełnie Losowa Spółka")), CTX),
    CandidateQueryMismatchError,
  );
});

test("invalid candidateId → InvalidCandidateIdError", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate("cmp_de_krs_0000123456", query("Alfa"), krsProvider(krsCompany("Alfa")), CTX),
    InvalidCandidateIdError,
  );
});

test("KRS not found → CandidateNotFoundError", async () => {
  await assert.rejects(
    () => confirmSelectedCandidate(ID, query("Alfa"), krsProvider(null), CTX),
    CandidateNotFoundError,
  );
});
