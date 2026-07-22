import { isTargetHost } from "../domain-confirmation/targetHosts.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { DomainResolutionInvariantError } from "./errors.ts";
import type { CompanyDomainEvaluationResult, EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";

/**
 * Pure defensive invariants for the resolution orchestration. They guard
 * logically-impossible internal states (a broken evaluation/confirmation
 * contract) and are exported so they can be unit-tested directly. They throw
 * `DomainResolutionInvariantError`; they NEVER convert an impossible state into a
 * domain status such as not_found.
 */

/**
 * Asserts a `probable` evaluation selected exactly one probable candidate, and
 * that the selected candidate IS that candidate. Returns the selected candidate.
 */
export function assertProbableSelection(
  evaluation: CompanyDomainEvaluationResult,
): EvaluatedDomainCandidate {
  const probable = evaluation.candidates.filter((c) => c.status === "probable");
  const selected = evaluation.selectedCandidate;
  if (selected === null) {
    throw new DomainResolutionInvariantError("probable evaluation without a selected candidate");
  }
  if (probable.length !== 1) {
    throw new DomainResolutionInvariantError(
      "probable evaluation without exactly one probable candidate",
    );
  }
  if (probable[0] !== selected) {
    throw new DomainResolutionInvariantError(
      "selected candidate is not the single probable candidate",
    );
  }
  return selected;
}

/**
 * Asserts confirmed evidence origins are origin-only AND belong to the confirmed
 * target-domain (host or its exact www/apex counterpart). Defense-in-depth over
 * the confirmation module's own filtering.
 */
export function assertConfirmedSourceOrigins(
  sourceOrigins: readonly string[],
  confirmedDomain: string,
): void {
  if (sourceOrigins.length === 0) {
    throw new DomainResolutionInvariantError("confirmed status without any evidence source");
  }
  for (const origin of sourceOrigins) {
    const safe = safeOriginFromUrl(origin);
    if (safe === null || safe.origin !== origin) {
      throw new DomainResolutionInvariantError("confirmed evidence source is not origin-only");
    }
    if (!isTargetHost(safe.hostname, confirmedDomain)) {
      throw new DomainResolutionInvariantError("confirmed evidence source is off the confirmed domain");
    }
  }
}

/**
 * Asserts a `confirmed` confirmation has a non-null origin that exactly equals
 * the selected candidate's canonical origin, backed by valid origin-only,
 * on-domain evidence. Returns the confirmed origin.
 */
export function assertConfirmedOrigin(
  confirmation: DomainConfirmationResult,
  selected: EvaluatedDomainCandidate,
): string {
  if (confirmation.confirmedOrigin === null) {
    throw new DomainResolutionInvariantError("confirmed confirmation without a confirmed origin");
  }
  if (confirmation.confirmedOrigin !== selected.origin) {
    throw new DomainResolutionInvariantError(
      "confirmed origin differs from the selected candidate origin",
    );
  }
  assertConfirmedSourceOrigins(confirmation.sourceOrigins, selected.domain);
  return confirmation.confirmedOrigin;
}
