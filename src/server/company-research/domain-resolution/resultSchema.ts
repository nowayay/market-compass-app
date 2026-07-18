/**
 * Strict runtime-shape validation for the RAW `CompanyDomainResolutionResult` a
 * `resolveCompanyDomain` dependency returns, BEFORE it is trusted, privacy-
 * checked or cloned. An injected dependency (production closure or test stub) is
 * untrusted input: this rejects an unexpected/hostile field (e.g. a smuggled
 * `contactPerson`, `sourceSnippet`, exact page URL) instead of a permissive
 * clone silently discarding it, validates every declared origin field directly
 * with the existing origin-safety primitive, and encodes the EXACT result
 * matrix for every status — not merely "non-confirmed implies null
 * confirmedOrigin".
 *
 * All object/array reads go through `assertExactOwnShape`/`assertDenseArray`
 * (own-property-only, sparse-array-rejecting) — see `shared/runtimeShape.ts`
 * for the prototype-pollution and sparse-array policy this enforces. Every
 * returned value is a FRESH object/array, never the original input.
 *
 * The exact matrix (reverse-engineered from `resolveCompanyDomain.ts`'s own
 * `build()` helper — the SOLE producer of this type):
 *
 *   not_found                — selectedCandidate=null, evaluatedCandidates=[],
 *                               confirmation=null, confirmedOrigin=null,
 *                               sourceOrigins=[], reasons=["NO_DISCOVERY_CANDIDATES"]
 *   unverified (evaluation)  — selectedCandidate=null, confirmation=null,
 *                               confirmedOrigin=null, sourceOrigins=[],
 *                               reasons=["NO_PROBABLE_CANDIDATE"] (0 probable) or
 *                               reasons=["MULTIPLE_PROBABLE_CANDIDATES"] (>=2 probable)
 *   unverified (confirmation)— selectedCandidate=sole probable candidate,
 *                               confirmation.status="unverified", confirmedOrigin=null,
 *                               sourceOrigins=[], reasons=["CONFIRMATION_UNVERIFIED"]
 *   conflict                 — selectedCandidate=sole probable candidate,
 *                               confirmation.status="conflict", confirmedOrigin=null,
 *                               sourceOrigins=[], reasons=["CONFIRMATION_CONFLICT"]
 *   confirmed                — full contract preserved; deeper cross-field
 *                               consistency stays owned by
 *                               `business-research/invariants.ts`'s
 *                               `assertConfirmedResolutionTarget` (reused, not
 *                               duplicated, by every caller that needs it).
 */
import { MAX_EVALUATION_SCORE } from "../domain-evaluation/evaluateDomainCandidate.ts";
import { CONFLICT_ORDER, REASON_ORDER } from "../domain-evaluation/reasonCodes.ts";
import {
  CONFIRMATION_CONFLICT_ORDER,
  CONFIRMATION_REASON_ORDER,
} from "../domain-confirmation/reasonCodes.ts";
import {
  arraysEqual,
  assertDenseArray,
  assertExactOwnShape,
  isCanonicalOrderedSubset,
  isOriginOnlyUrl,
  originHostname,
  requireNonEmptyString,
} from "../shared/runtimeShape.ts";
import { DomainResolutionInvariantError } from "./errors.ts";
import type { DomainEvaluationConflictCode, DomainEvaluationReasonCode } from "../domain-evaluation/reasonCodes.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainDiscoverySignals } from "../domain-discovery/types.ts";
import type {
  DomainConfirmationConflictCode,
  DomainConfirmationReasonCode,
} from "../domain-confirmation/reasonCodes.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";
import type { CompanyDomainResolutionResult, DomainResolutionStatus } from "./types.ts";
import type { DomainResolutionReasonCode } from "./reasonCodes.ts";

const fail = (message: string): never => {
  throw new DomainResolutionInvariantError(message);
};

const RESOLUTION_STATUSES: ReadonlySet<DomainResolutionStatus> = new Set([
  "confirmed",
  "unverified",
  "conflict",
  "not_found",
]);
const CANDIDATE_STATUSES = new Set(["probable", "unverified", "rejected"]);
const CONFIRMATION_STATUSES = new Set(["confirmed", "conflict", "unverified"]);
const VERIFIED_IDENTIFIER_TYPES = new Set(["krs", "nip", "regon"]);

const RESULT_KEYS = [
  "status",
  "confirmedOrigin",
  "selectedCandidate",
  "evaluatedCandidates",
  "confirmation",
  "reasons",
  "sourceOrigins",
];
const CANDIDATE_KEYS = ["origin", "domain", "status", "score", "reasons", "conflicts", "sourceOrigins", "signals"];
const SIGNALS_KEYS = ["matchedLegalName", "matchedKrs", "matchedNip", "matchedRegon", "matchedCity"];
const CONFIRMATION_KEYS = ["status", "confirmedOrigin", "verifiedIdentifiers", "reasons", "conflicts", "sourceOrigins"];

function assertOriginArray(value: unknown, context: string): string[] {
  return assertDenseArray(
    value,
    (item) => {
      if (!isOriginOnlyUrl(item)) fail(`${context} contains a value that is not origin-only`);
      return item as string;
    },
    fail,
    context,
  );
}

function assertMatchedIdentifierField(value: unknown, key: string): string | null {
  if (value === null) return null;
  return requireNonEmptyString(value, fail, `candidate signals.${key} is neither null nor a non-empty string`);
}

function assertValidCandidateShape(value: unknown): EvaluatedDomainCandidate {
  const c = assertExactOwnShape(value, CANDIDATE_KEYS, fail, "evaluated candidate");

  const originRaw = c.get("origin");
  if (!isOriginOnlyUrl(originRaw)) fail("candidate origin is not origin-only");
  const origin = originRaw as string;
  const domain = requireNonEmptyString(c.get("domain"), fail, "candidate domain does not match its origin hostname");
  if (domain !== originHostname(origin)) fail("candidate domain does not match its origin hostname");
  const statusRaw = c.get("status");
  if (typeof statusRaw !== "string" || !CANDIDATE_STATUSES.has(statusRaw)) fail("candidate status is invalid");
  const status = statusRaw as EvaluatedDomainCandidate["status"];
  const scoreRaw = c.get("score");
  if (
    typeof scoreRaw !== "number" ||
    !Number.isFinite(scoreRaw) ||
    scoreRaw < 0 ||
    scoreRaw > MAX_EVALUATION_SCORE
  ) {
    fail("candidate score is out of range");
  }
  const score = scoreRaw as number;
  const reasons = assertDenseArray(
    c.get("reasons"),
    (item) => item as DomainEvaluationReasonCode,
    fail,
    "candidate reasons",
  );
  if (!isCanonicalOrderedSubset(reasons, REASON_ORDER)) fail("candidate reasons is not a canonical closed-enum set");
  const conflicts = assertDenseArray(
    c.get("conflicts"),
    (item) => item as DomainEvaluationConflictCode,
    fail,
    "candidate conflicts",
  );
  if (!isCanonicalOrderedSubset(conflicts, CONFLICT_ORDER)) {
    fail("candidate conflicts is not a canonical closed-enum set");
  }
  const sourceOrigins = assertOriginArray(c.get("sourceOrigins"), "candidate sourceOrigins");

  const signalsMap = assertExactOwnShape(c.get("signals"), SIGNALS_KEYS, fail, "candidate signals");
  const signals: DomainDiscoverySignals = {
    matchedLegalName: assertMatchedIdentifierField(signalsMap.get("matchedLegalName"), "matchedLegalName"),
    matchedKrs: assertMatchedIdentifierField(signalsMap.get("matchedKrs"), "matchedKrs"),
    matchedNip: assertMatchedIdentifierField(signalsMap.get("matchedNip"), "matchedNip"),
    matchedRegon: assertMatchedIdentifierField(signalsMap.get("matchedRegon"), "matchedRegon"),
    matchedCity: assertMatchedIdentifierField(signalsMap.get("matchedCity"), "matchedCity"),
  };

  return {
    origin: origin as string,
    domain,
    status: status as EvaluatedDomainCandidate["status"],
    score,
    reasons,
    conflicts,
    sourceOrigins,
    signals,
  };
}

function assertValidCandidateArrayShape(value: unknown): EvaluatedDomainCandidate[] {
  return assertDenseArray(value, (item) => assertValidCandidateShape(item), fail, "evaluatedCandidates");
}

function assertValidConfirmationShape(value: unknown): DomainConfirmationResult {
  const c = assertExactOwnShape(value, CONFIRMATION_KEYS, fail, "confirmation");

  const status = c.get("status");
  if (typeof status !== "string" || !CONFIRMATION_STATUSES.has(status)) fail("confirmation status is invalid");
  const confirmedOrigin = c.get("confirmedOrigin");
  if (confirmedOrigin !== null && !isOriginOnlyUrl(confirmedOrigin)) {
    fail("confirmation confirmedOrigin is neither null nor origin-only");
  }
  if (status !== "confirmed" && confirmedOrigin !== null) {
    fail("non-confirmed confirmation carries a confirmedOrigin");
  }
  const verifiedIdentifiers = assertDenseArray(
    c.get("verifiedIdentifiers"),
    (item) => {
      if (typeof item !== "string" || !VERIFIED_IDENTIFIER_TYPES.has(item)) {
        fail("confirmation verifiedIdentifiers contains an invalid identifier type");
      }
      return item as "krs" | "nip" | "regon";
    },
    fail,
    "confirmation verifiedIdentifiers",
  );
  if (new Set(verifiedIdentifiers).size !== verifiedIdentifiers.length) {
    fail("confirmation verifiedIdentifiers contains a duplicate");
  }
  const reasons = assertDenseArray(
    c.get("reasons"),
    (item) => item as DomainConfirmationReasonCode,
    fail,
    "confirmation reasons",
  );
  if (!isCanonicalOrderedSubset(reasons, CONFIRMATION_REASON_ORDER)) {
    fail("confirmation reasons is not a canonical closed-enum set");
  }
  const conflicts = assertDenseArray(
    c.get("conflicts"),
    (item) => item as DomainConfirmationConflictCode,
    fail,
    "confirmation conflicts",
  );
  if (!isCanonicalOrderedSubset(conflicts, CONFIRMATION_CONFLICT_ORDER)) {
    fail("confirmation conflicts is not a canonical closed-enum set");
  }
  const sourceOrigins = assertOriginArray(c.get("sourceOrigins"), "confirmation sourceOrigins");

  return {
    status: status as DomainConfirmationResult["status"],
    confirmedOrigin: confirmedOrigin as string | null,
    verifiedIdentifiers,
    reasons,
    conflicts,
    sourceOrigins,
  };
}

/** The sole `probable` evaluated candidate must field-match `selected` exactly
 * (by origin+domain — results are structurally detached, so reference identity
 * is not expected to hold). Applies whenever a candidate was selected at all
 * (conflict / confirmation-unverified / confirmed). */
function assertSelectedMatchesSoleProbable(
  selected: EvaluatedDomainCandidate,
  evaluatedCandidates: readonly EvaluatedDomainCandidate[],
): void {
  if (selected.status !== "probable") fail("selected candidate is not probable");
  const probable = evaluatedCandidates.filter((c) => c.status === "probable");
  if (probable.length !== 1) fail("resolution does not have exactly one probable evaluated candidate");
  const sole = probable[0];
  if (sole.origin !== selected.origin || sole.domain !== selected.domain) {
    fail("selected candidate does not match the sole probable evaluated candidate");
  }
}

/** Validates the exact single-reason set required for a given status/branch. */
function assertExactReasons(
  reasons: readonly DomainResolutionReasonCode[],
  expected: readonly DomainResolutionReasonCode[],
  context: string,
): void {
  if (!arraysEqual(reasons, expected)) fail(`${context} reasons do not match the exact required set`);
}

/**
 * Validates the COMPLETE raw runtime shape of a `CompanyDomainResolutionResult`
 * — including the EXACT non-confirmed status matrix — and returns a FRESH
 * result (never the original input). Throws `DomainResolutionInvariantError` on
 * the first violation.
 */
export function assertValidDomainResolutionResultShape(value: unknown): CompanyDomainResolutionResult {
  const r = assertExactOwnShape(value, RESULT_KEYS, fail, "domain resolution result");

  const statusRaw = r.get("status");
  if (typeof statusRaw !== "string" || !RESOLUTION_STATUSES.has(statusRaw as DomainResolutionStatus)) {
    fail("domain resolution status is invalid");
  }
  const status = statusRaw as DomainResolutionStatus;

  const confirmedOriginRaw = r.get("confirmedOrigin");
  if (confirmedOriginRaw !== null && !isOriginOnlyUrl(confirmedOriginRaw)) {
    fail("domain resolution confirmedOrigin is neither null nor origin-only");
  }
  if (status !== "confirmed" && confirmedOriginRaw !== null) {
    fail("non-confirmed domain resolution carries a confirmedOrigin");
  }

  const selectedCandidateRaw = r.get("selectedCandidate");
  const selectedCandidate = selectedCandidateRaw === null ? null : assertValidCandidateShape(selectedCandidateRaw);
  const evaluatedCandidates = assertValidCandidateArrayShape(r.get("evaluatedCandidates"));

  const confirmationRaw = r.get("confirmation");
  const confirmation = confirmationRaw === null ? null : assertValidConfirmationShape(confirmationRaw);
  if (confirmation !== null && status !== "confirmed" && confirmation.status === "confirmed") {
    fail("non-confirmed domain resolution carries a confirmed confirmation payload");
  }

  const reasons = assertDenseArray(
    r.get("reasons"),
    (item) => item as DomainResolutionReasonCode,
    fail,
    "domain resolution reasons",
  );

  const sourceOrigins = assertOriginArray(r.get("sourceOrigins"), "domain resolution sourceOrigins");

  // --- The exact matrix per status -----------------------------------------
  switch (status) {
    case "not_found": {
      if (selectedCandidate !== null) fail("not_found resolution carries a selected candidate");
      if (evaluatedCandidates.length !== 0) fail("not_found resolution carries evaluated candidates");
      if (confirmation !== null) fail("not_found resolution carries a confirmation payload");
      if (sourceOrigins.length !== 0) fail("not_found resolution carries source origins");
      assertExactReasons(reasons, ["NO_DISCOVERY_CANDIDATES"], "not_found");
      break;
    }
    case "unverified": {
      if (sourceOrigins.length !== 0) fail("unverified resolution carries source origins");
      const isConfirmationUnverified = confirmation !== null;
      if (!isConfirmationUnverified) {
        // Evaluation-only unverified: confirmation never ran.
        if (selectedCandidate !== null) fail("evaluation-only unverified resolution carries a selected candidate");
        const probableCount = evaluatedCandidates.filter((c) => c.status === "probable").length;
        if (probableCount > 1) {
          assertExactReasons(reasons, ["MULTIPLE_PROBABLE_CANDIDATES"], "evaluation-only unverified");
        } else {
          assertExactReasons(reasons, ["NO_PROBABLE_CANDIDATE"], "evaluation-only unverified");
          if (probableCount !== 0) fail("NO_PROBABLE_CANDIDATE resolution has a probable evaluated candidate");
        }
      } else {
        // Confirmation ran and reported unverified.
        if (confirmation!.status !== "unverified") fail("unverified resolution confirmation status disagrees");
        if (selectedCandidate === null) fail("confirmation-unverified resolution is missing a selected candidate");
        assertSelectedMatchesSoleProbable(selectedCandidate!, evaluatedCandidates);
        assertExactReasons(reasons, ["CONFIRMATION_UNVERIFIED"], "confirmation-unverified");
      }
      break;
    }
    case "conflict": {
      if (sourceOrigins.length !== 0) fail("conflict resolution carries source origins");
      if (confirmation === null || confirmation.status !== "conflict") {
        fail("conflict resolution requires a conflict confirmation payload");
      }
      if (selectedCandidate === null) fail("conflict resolution is missing a selected candidate");
      assertSelectedMatchesSoleProbable(selectedCandidate!, evaluatedCandidates);
      assertExactReasons(reasons, ["CONFIRMATION_CONFLICT"], "conflict");
      break;
    }
    case "confirmed": {
      if (confirmation === null) fail('domain resolution status "confirmed" requires a confirmation payload');
      if (selectedCandidate === null) fail("confirmed resolution is missing a selected candidate");
      assertSelectedMatchesSoleProbable(selectedCandidate!, evaluatedCandidates);
      assertExactReasons(reasons, ["CONFIRMATION_CONFIRMED"], "confirmed");
      // Deeper confirmed-specific consistency (confirmedOrigin/verifiedIdentifiers/
      // sourceOrigins cross-checks) stays owned by `assertConfirmedResolutionTarget`,
      // reused (not duplicated) by callers that need it.
      break;
    }
  }

  return {
    status,
    confirmedOrigin: confirmedOriginRaw as string | null,
    selectedCandidate,
    evaluatedCandidates,
    confirmation,
    reasons,
    sourceOrigins,
  };
}
