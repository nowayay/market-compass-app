import { test } from "node:test";
import assert from "node:assert/strict";
import { guardAndValidateResponse } from "../responseGuard.ts";
import { CompanyResearchInternalError } from "../errors.ts";
import { buildCompletedResponse } from "../mappers/toDashboardResponse.ts";
import {
  buildNeedsConfirmationResponse,
  buildWebSource,
} from "../mappers/toIdentificationResponse.ts";
import { COMPANY_RESEARCH_VERSION } from "../../../contracts/companyResearch.ts";
import type {
  CompletedResponse,
  NeedsConfirmationResponse,
} from "../../../contracts/companyResearch.ts";
import type { ScoredCandidate } from "../identification/types.ts";
import type { KrsCompany, NormalizedQuery } from "../types.ts";

const RETRIEVED_AT = "2026-07-14T10:00:00.000Z";

function krsCompany(overrides: Partial<KrsCompany> = {}): KrsCompany {
  return {
    krs: "0000123456",
    legalName: "PRZYKŁADOWA SP. Z O.O.",
    legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
    nip: "1234563218",
    regon: "123456785",
    registrationDate: "2011-01-01",
    city: "WARSZAWA",
    region: "MAZOWIECKIE",
    countryCode: "PL",
    pkdPrimaryCode: "62.01.Z",
    pkdSecondaryCodes: [],
    pkdLabels: [],
    retrievedAt: RETRIEVED_AT,
    ...overrides,
  };
}

const query: NormalizedQuery = { name: "Przykładowa", countryCode: "PL", krs: "0000123456" };

function completed(extraWebOrigin?: { origin: string; hostname: string }): CompletedResponse {
  return buildCompletedResponse({
    requestId: "req-1",
    query,
    company: krsCompany(),
    version: COMPANY_RESEARCH_VERSION,
    researchedAt: RETRIEVED_AT,
    extraSources: extraWebOrigin ? [buildWebSource(extraWebOrigin, RETRIEVED_AT)] : undefined,
  });
}

function needsConfirmation(): NeedsConfirmationResponse {
  const scored: ScoredCandidate[] = [
    {
      krsCompany: krsCompany({ krs: "0000000001", legalName: "Alfa Sp. z o.o." }),
      discovered: { legalName: "Alfa", krs: "0000000001", countryCode: "PL" },
      strength: "exact",
      confidence: 0.9,
      matchReasons: ["Numer KRS potwierdzony w oficjalnym rejestrze"],
    },
  ];
  return buildNeedsConfirmationResponse({
    requestId: "req-1",
    query: { name: "Alfa", countryCode: "PL" },
    scored,
    webSources: [{ origin: "https://alfa.example", hostname: "alfa.example" }],
    retrievedAt: RETRIEVED_AT,
  });
}

/** Cast helper to tamper with an object without using `any`. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

// --- positive: valid KRS-only completed response still accepted ---
test("a valid KRS-only completed response passes the final gate", () => {
  const result = guardAndValidateResponse(completed());
  assert.equal(result.status, "completed");
});

test("a valid completed response with a web discovery source passes", () => {
  const result = guardAndValidateResponse(
    completed({ origin: "https://company.example", hostname: "company.example" }),
  );
  assert.equal(result.status, "completed");
});

test("a valid needs_confirmation response passes the final gate", () => {
  const result = guardAndValidateResponse(needsConfirmation());
  assert.equal(result.status, "needs_confirmation");
});

// --- negative: referential integrity ---
test("evidence referencing a nonexistent source is rejected", () => {
  const bad = completed();
  asRecord(bad.evidence.facts[0]).sourceIds = ["src_krs_9999999999"];
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

test("duplicate source ids are rejected", () => {
  const bad = completed();
  // A second source object with the SAME id (schema-valid on its own).
  bad.sources.push({ ...bad.sources[0] });
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

test("duplicate evidence ids are rejected", () => {
  const bad = completed();
  bad.evidence.facts.push({ ...bad.evidence.facts[0] });
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

test("a candidate referencing a nonexistent source is rejected", () => {
  const bad = needsConfirmation();
  asRecord(bad.candidates[0]).sourceIds = ["src_krs_0000000000"];
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

// --- negative: domain must match url hostname ---
test("a source whose domain does not match its url hostname is rejected", () => {
  const bad = completed({ origin: "https://company.example", hostname: "company.example" });
  // sources[1] is the web source; break the domain/hostname correspondence.
  asRecord(bad.sources[1]).domain = "evil.example";
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});

// --- negative: url must satisfy the origin-only source-security policy ---
test("a source url that violates the origin-only policy is rejected at the gate", () => {
  // localhost passes the schema's origin-equality check but violates the policy.
  const bad = completed({ origin: "https://localhost", hostname: "localhost" });
  assert.throws(() => guardAndValidateResponse(bad), CompanyResearchInternalError);
});
