/**
 * Internal types for deterministic domain candidate EVALUATION.
 *
 * Pure types only (no runtime imports). This layer evaluates discovery
 * candidates deterministically — it does NOT produce a "confirmed" official
 * domain (model-returned identifiers are untrusted discovery signals, and
 * provider-attested search metadata proves only that a URL appeared in results,
 * not that an identifier was present on the page). These types are INTERNAL and
 * are NOT part of the public Company Research contract.
 */
import type {
  CompanyDomainDiscoveryInput,
  DomainDiscoverySignals,
} from "../domain-discovery/types.ts";
import type {
  DomainEvaluationConflictCode,
  DomainEvaluationReasonCode,
} from "./reasonCodes.ts";

/**
 * The KRS-verified company data the evaluator compares against. Structurally the
 * allowlisted discovery input (legalName, aliases, krs, nip, regon, city, region,
 * countryCode, legalForm) — never a raw KRS payload, request body or person data.
 */
export type DomainEvaluationCompany = CompanyDomainDiscoveryInput;

/**
 * Per-candidate evaluation status. There is deliberately NO "confirmed" — this
 * module cannot prove official-domain ownership from discovery signals.
 */
export type DomainCandidateStatus = "probable" | "unverified" | "rejected";

/** A discovered candidate after deterministic evaluation. INTERNAL only. */
export interface EvaluatedDomainCandidate {
  origin: string;
  domain: string;
  status: DomainCandidateStatus;
  /** Deterministic additive score, clamped to [0, MAX]. Secondary to hard rules. */
  score: number;
  reasons: DomainEvaluationReasonCode[];
  conflicts: DomainEvaluationConflictCode[];
  /** Origin-only, provider-attested sources carried over from discovery. */
  sourceOrigins: string[];
  signals: DomainDiscoverySignals;
}

/** Overall evaluation status for a company. No "confirmed" here either. */
export type CompanyDomainEvaluationStatus = "probable" | "unverified" | "not_found";

/** The deterministic evaluation result. INTERNAL only (no public API wiring). */
export interface CompanyDomainEvaluationResult {
  status: CompanyDomainEvaluationStatus;
  selectedCandidate: EvaluatedDomainCandidate | null;
  candidates: EvaluatedDomainCandidate[];
  reasons: DomainEvaluationReasonCode[];
}
