import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertConfirmedOrigin,
  assertConfirmedSourceOrigins,
  assertProbableSelection,
} from "../domain-resolution/invariants.ts";
import { DomainResolutionInvariantError } from "../domain-resolution/errors.ts";
import { orderResolutionReasons } from "../domain-resolution/reasonCodes.ts";
import type {
  CompanyDomainEvaluationResult,
  EvaluatedDomainCandidate,
} from "../domain-evaluation/types.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";

const ORIGIN = "https://kowalski.example";
const DOMAIN = "kowalski.example";

function candidate(o: Partial<EvaluatedDomainCandidate> = {}): EvaluatedDomainCandidate {
  return {
    origin: ORIGIN,
    domain: DOMAIN,
    status: "probable",
    score: 100,
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    signals: { matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null },
    ...o,
  };
}

function evaluation(o: Partial<CompanyDomainEvaluationResult> = {}): CompanyDomainEvaluationResult {
  const c = candidate();
  return { status: "probable", selectedCandidate: c, candidates: [c], reasons: [], ...o };
}

function confirmation(o: Partial<DomainConfirmationResult> = {}): DomainConfirmationResult {
  return {
    status: "confirmed",
    confirmedOrigin: ORIGIN,
    verifiedIdentifiers: ["nip"],
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    ...o,
  };
}

// --- assertProbableSelection -------------------------------------------------

test("valid single probable selection returns the selected candidate", () => {
  const evalResult = evaluation();
  assert.equal(assertProbableSelection(evalResult), evalResult.selectedCandidate);
});

// (38) impossible probable-without-selected
test("probable evaluation with a null selected candidate is rejected", () => {
  const c = candidate();
  const bad = { status: "probable", selectedCandidate: null, candidates: [c], reasons: [] } as CompanyDomainEvaluationResult;
  assert.throws(() => assertProbableSelection(bad), DomainResolutionInvariantError);
});

test("probable evaluation with multiple probable candidates is rejected", () => {
  const c1 = candidate({ origin: "https://a.example", domain: "a.example" });
  const c2 = candidate({ origin: "https://b.example", domain: "b.example" });
  const bad = { status: "probable", selectedCandidate: c1, candidates: [c1, c2], reasons: [] } as CompanyDomainEvaluationResult;
  assert.throws(() => assertProbableSelection(bad), DomainResolutionInvariantError);
});

test("probable evaluation whose selected candidate is not the probable one is rejected", () => {
  const inList = candidate();
  const other = candidate({ origin: "https://other.example", domain: "other.example" });
  const bad = { status: "probable", selectedCandidate: other, candidates: [inList], reasons: [] } as CompanyDomainEvaluationResult;
  assert.throws(() => assertProbableSelection(bad), DomainResolutionInvariantError);
});

// --- assertConfirmedOrigin ---------------------------------------------------

test("a valid confirmed confirmation returns the confirmed origin", () => {
  assert.equal(assertConfirmedOrigin(confirmation(), candidate()), ORIGIN);
});

// (39) confirmed-with-null-origin
test("confirmed confirmation with a null origin is rejected", () => {
  assert.throws(
    () => assertConfirmedOrigin(confirmation({ confirmedOrigin: null }), candidate()),
    DomainResolutionInvariantError,
  );
});

// (40) confirmed-origin mismatch
test("confirmed origin that differs from the selected candidate origin is rejected", () => {
  assert.throws(
    () => assertConfirmedOrigin(confirmation({ confirmedOrigin: "https://evil.example" }), candidate()),
    DomainResolutionInvariantError,
  );
});

// --- assertConfirmedSourceOrigins --------------------------------------------

test("origin-only, on-domain (incl. www counterpart) evidence is accepted", () => {
  assert.doesNotThrow(() => assertConfirmedSourceOrigins([ORIGIN], DOMAIN));
  assert.doesNotThrow(() => assertConfirmedSourceOrigins(["https://www.kowalski.example"], DOMAIN));
});

test("empty confirmed evidence is rejected", () => {
  assert.throws(() => assertConfirmedSourceOrigins([], DOMAIN), DomainResolutionInvariantError);
});

test("a non-origin-only evidence URL (path present) is rejected", () => {
  assert.throws(
    () => assertConfirmedSourceOrigins(["https://kowalski.example/kontakt"], DOMAIN),
    DomainResolutionInvariantError,
  );
});

test("an off-domain or arbitrary-subdomain evidence origin is rejected", () => {
  assert.throws(() => assertConfirmedSourceOrigins(["https://aggregator.example"], DOMAIN), DomainResolutionInvariantError);
  assert.throws(() => assertConfirmedSourceOrigins(["https://blog.kowalski.example"], DOMAIN), DomainResolutionInvariantError);
});

// --- reason ordering / dedup -------------------------------------------------

test("reasons are canonically ordered and de-duplicated", () => {
  assert.deepEqual(
    orderResolutionReasons([
      "CONFIRMATION_CONFIRMED",
      "NO_DISCOVERY_CANDIDATES",
      "CONFIRMATION_CONFIRMED",
    ]),
    ["NO_DISCOVERY_CANDIDATES", "CONFIRMATION_CONFIRMED"],
  );
});
