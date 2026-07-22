import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { evaluateDomainCandidate } from "./evaluateDomainCandidate.ts";
import type { DiscoveredDomainCandidate } from "../domain-discovery/types.ts";
import type { DomainEvaluationReasonCode } from "./reasonCodes.ts";
import type {
  CompanyDomainEvaluationResult,
  CompanyDomainEvaluationStatus,
  DomainCandidateStatus,
  DomainEvaluationCompany,
  EvaluatedDomainCandidate,
} from "./types.ts";

/** Status priority for deterministic sorting (lower = higher priority). */
const STATUS_PRIORITY: Record<DomainCandidateStatus, number> = {
  probable: 0,
  unverified: 1,
  rejected: 2,
};

/** Deterministic order: status priority, then score desc, then origin asc. */
function compareCandidates(a: EvaluatedDomainCandidate, b: EvaluatedDomainCandidate): number {
  const byStatus = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  if (byStatus !== 0) return byStatus;
  if (b.score !== a.score) return b.score - a.score;
  return a.origin < b.origin ? -1 : a.origin > b.origin ? 1 : 0;
}

/**
 * Deterministic, pure, synchronous domain candidate evaluation. No network, no
 * OpenAI, no model authority: status is derived entirely from KRS-verified data
 * plus untrusted discovery signals. It never produces "confirmed" — an official
 * domain cannot be proven from discovery signals here.
 *
 * Selection rules:
 *  - 0 candidates                    → not_found, no selection
 *  - exactly 1 probable              → probable, select it
 *  - >1 probable                     → unverified, MULTIPLE_PROBABLE_CANDIDATES
 *  - only unverified/rejected        → unverified, no selection
 *  - rejected candidates are never selected
 */
export function evaluateCompanyDomains(
  company: DomainEvaluationCompany,
  discoveredCandidates: readonly DiscoveredDomainCandidate[],
): CompanyDomainEvaluationResult {
  const candidates = discoveredCandidates
    .map((candidate) => evaluateDomainCandidate(company, candidate))
    .sort(compareCandidates);

  const reasons: DomainEvaluationReasonCode[] = [];
  let status: CompanyDomainEvaluationStatus;
  let selectedCandidate: EvaluatedDomainCandidate | null = null;

  const probable = candidates.filter((c) => c.status === "probable");

  if (candidates.length === 0) {
    status = "not_found";
  } else if (probable.length === 1) {
    status = "probable";
    selectedCandidate = probable[0];
  } else if (probable.length > 1) {
    status = "unverified";
    reasons.push("MULTIPLE_PROBABLE_CANDIDATES");
  } else {
    status = "unverified";
  }

  const result: CompanyDomainEvaluationResult = {
    status,
    selectedCandidate,
    candidates,
    reasons,
  };

  // Defense-in-depth: the result carries only origins, enum codes, numbers and
  // company-name signals on approved legal-name paths — never person data.
  assertNoPersonalData(result, "domainEvaluationResult");
  return result;
}
