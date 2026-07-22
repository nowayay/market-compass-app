/**
 * Narrow, explicit deep-clone helpers for the plain structured internal result
 * objects returned by domain resolution.
 *
 * The resolution result must be fully DETACHED from the upstream stage results
 * (evaluation / confirmation): a later internal consumer mutating one field must
 * never silently change another (which could invalidate an already-checked
 * invariant). These clones copy every mutable nested array/object by value; no
 * `JSON.parse(JSON.stringify(...))`, and no repository-wide readonly refactor.
 *
 * Pure and dependency-free (types only).
 */
import type { DomainDiscoverySignals } from "../domain-discovery/types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";

/** Clones the flat (all-primitive) discovery signals into a new object. */
function cloneDomainDiscoverySignals(signals: DomainDiscoverySignals): DomainDiscoverySignals {
  return {
    matchedLegalName: signals.matchedLegalName,
    matchedKrs: signals.matchedKrs,
    matchedNip: signals.matchedNip,
    matchedRegon: signals.matchedRegon,
    matchedCity: signals.matchedCity,
  };
}

/**
 * Returns a fully detached copy of an evaluated candidate: `reasons`,
 * `conflicts`, `sourceOrigins` become new arrays and `signals` a new object.
 * Primitive fields are copied by value.
 */
export function cloneEvaluatedDomainCandidate(
  candidate: EvaluatedDomainCandidate,
): EvaluatedDomainCandidate {
  return {
    origin: candidate.origin,
    domain: candidate.domain,
    status: candidate.status,
    score: candidate.score,
    reasons: [...candidate.reasons],
    conflicts: [...candidate.conflicts],
    sourceOrigins: [...candidate.sourceOrigins],
    signals: cloneDomainDiscoverySignals(candidate.signals),
  };
}

/** Clones a list of evaluated candidates, each fully detached. */
export function cloneEvaluatedDomainCandidates(
  candidates: readonly EvaluatedDomainCandidate[],
): EvaluatedDomainCandidate[] {
  return candidates.map(cloneEvaluatedDomainCandidate);
}

/**
 * Returns a fully detached copy of a confirmation result: `verifiedIdentifiers`,
 * `reasons`, `conflicts` and `sourceOrigins` become new arrays. Primitive fields
 * are copied by value.
 */
export function cloneDomainConfirmationResult(
  confirmation: DomainConfirmationResult,
): DomainConfirmationResult {
  return {
    status: confirmation.status,
    confirmedOrigin: confirmation.confirmedOrigin,
    verifiedIdentifiers: [...confirmation.verifiedIdentifiers],
    reasons: [...confirmation.reasons],
    conflicts: [...confirmation.conflicts],
    sourceOrigins: [...confirmation.sourceOrigins],
  };
}
