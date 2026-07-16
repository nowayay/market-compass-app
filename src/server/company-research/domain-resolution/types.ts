/**
 * Internal types for Official Domain RESOLUTION.
 *
 * Pure types only (no runtime imports) so the orchestrator and its tests can
 * depend on this without pulling in any server-only or bundler-only code.
 *
 * Resolution is INTERNAL: it is not wired into the public Company Research API,
 * never sets `company.website`, and never emits public `FactEvidence`. It carries
 * only origin-only sources, strict enum codes, and company-as-entity data.
 */
import type { DomainDiscoveryBudget } from "../domain-discovery/domainDiscoveryBudget.ts";
import type { CompanyDomainDiscoveryProvider } from "../domain-discovery/types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainConfirmationBudget } from "../domain-confirmation/confirmationBudget.ts";
import type {
  CompanyDomainConfirmationProvider,
  DomainConfirmationResult,
} from "../domain-confirmation/types.ts";
import type { DomainResolutionReasonCode } from "./reasonCodes.ts";

/**
 * The four internal resolution verdicts. Operational failures (disabled /
 * rate-limited / busy / discovery timeout / discovery provider error / caller
 * cancellation) are NOT statuses — they propagate as typed errors.
 */
export type DomainResolutionStatus = "confirmed" | "unverified" | "conflict" | "not_found";

/**
 * Injected dependencies. The two paid flows keep their OWN budgets — the
 * orchestrator never acquires or releases a budget itself.
 */
export interface ResolveCompanyDomainDeps {
  discoveryProvider: CompanyDomainDiscoveryProvider;
  discoveryBudget: DomainDiscoveryBudget;
  confirmationProvider: CompanyDomainConfirmationProvider;
  confirmationBudget: DomainConfirmationBudget;
}

/** The single internal resolution result. INTERNAL only (no public API wiring). */
export interface CompanyDomainResolutionResult {
  status: DomainResolutionStatus;
  /** The canonical confirmed origin, set only when `confirmed`; otherwise null. */
  confirmedOrigin: string | null;
  /** The single probable candidate confirmation ran for, or null. */
  selectedCandidate: EvaluatedDomainCandidate | null;
  /** The full deterministic evaluation list (origin-only sources within). */
  evaluatedCandidates: EvaluatedDomainCandidate[];
  /** The confirmation result when confirmation ran, else null. */
  confirmation: DomainConfirmationResult | null;
  reasons: DomainResolutionReasonCode[];
  /**
   * Top-level independent evidence origins. Populated ONLY when `confirmed`
   * (from `confirmation.sourceOrigins`); empty for every other status. Discovery
   * sources are never promoted here — they remain on `evaluatedCandidates[*]`.
   */
  sourceOrigins: string[];
}
