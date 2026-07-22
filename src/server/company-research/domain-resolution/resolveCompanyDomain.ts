import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { buildDomainDiscoveryInput } from "../domain-discovery/buildDomainDiscoveryInput.ts";
import { discoverCompanyDomains } from "../domain-discovery/discoverCompanyDomains.ts";
import { evaluateCompanyDomains } from "../domain-evaluation/evaluateCompanyDomains.ts";
import { confirmCompanyDomain } from "../domain-confirmation/confirmCompanyDomain.ts";
import {
  cloneDomainConfirmationResult,
  cloneEvaluatedDomainCandidate,
  cloneEvaluatedDomainCandidates,
} from "./clone.ts";
import { DomainResolutionInvariantError } from "./errors.ts";
import { assertConfirmedOrigin, assertProbableSelection } from "./invariants.ts";
import { orderResolutionReasons } from "./reasonCodes.ts";
import type { DomainResolutionReasonCode } from "./reasonCodes.ts";
import type {
  CompanyDomainResolutionResult,
  DomainResolutionStatus,
  ResolveCompanyDomainDeps,
} from "./types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";
import type { KrsCompany } from "../types.ts";

/**
 * Internal Official Domain Resolution orchestration.
 *
 * Chains the three existing stages for an already KRS-confirmed company:
 *   discover (≤1 paid call) → deterministic evaluation (pure) →
 *   independent confirmation (≤1 paid call, ONLY for a single probable candidate)
 * and returns ONE strict internal verdict.
 *
 * Boundaries:
 *  - It NEVER acquires or releases a budget itself — discovery and confirmation
 *    own their budgets.
 *  - Operational failures (disabled / rate-limited / busy / discovery timeout /
 *    discovery provider error / invalid response / caller cancellation) are NOT
 *    statuses — they propagate as typed errors. They are never turned into
 *    not_found / conflict / confirmed.
 *  - Confirmation provider timeout / refusal / incomplete / failure is already
 *    reduced to `unverified` inside `confirmCompanyDomain` (unchanged here).
 *  - It is INTERNAL: it does not touch `company.website`, public FactEvidence,
 *    the public API, persistence or caching, and never fetches HTML.
 */
export async function resolveCompanyDomain(
  company: KrsCompany,
  deps: ResolveCompanyDomainDeps,
  options?: { signal?: AbortSignal },
): Promise<CompanyDomainResolutionResult> {
  // 1. Discover official-domain candidates (exactly one paid call). Operational
  //    errors propagate; confirmation is never reached after a discovery error.
  const discovery = await discoverCompanyDomains(
    company,
    { provider: deps.discoveryProvider, budget: deps.discoveryBudget },
    { signal: options?.signal },
  );

  // 2/3. Deterministic evaluation (pure, one call) over the SAME allowlisted
  //      input mapper discovery uses — no duplicated mapping logic.
  const evaluationInput = buildDomainDiscoveryInput(company);
  const evaluation = evaluateCompanyDomains(evaluationInput, discovery.candidates);

  const build = (
    status: DomainResolutionStatus,
    parts: {
      confirmedOrigin?: string | null;
      selectedCandidate?: EvaluatedDomainCandidate | null;
      confirmation?: DomainConfirmationResult | null;
      reasons: DomainResolutionReasonCode[];
      sourceOrigins?: string[];
    },
  ): CompanyDomainResolutionResult => {
    // Fully DETACH the result from the upstream evaluation/confirmation objects:
    // every mutable nested array/object is cloned so a later consumer mutating one
    // field can never silently change another (or an already-checked invariant).
    // The selected candidate is cloned SEPARATELY from the evaluatedCandidates
    // clones, so it is semantically equal but not the same reference.
    const result: CompanyDomainResolutionResult = {
      status,
      confirmedOrigin: parts.confirmedOrigin ?? null,
      selectedCandidate: parts.selectedCandidate
        ? cloneEvaluatedDomainCandidate(parts.selectedCandidate)
        : null,
      evaluatedCandidates: cloneEvaluatedDomainCandidates(evaluation.candidates),
      confirmation: parts.confirmation ? cloneDomainConfirmationResult(parts.confirmation) : null,
      reasons: orderResolutionReasons(parts.reasons), // already a fresh array
      sourceOrigins: [...(parts.sourceOrigins ?? [])],
    };
    // Defense-in-depth: origins + enum codes + approved legal-name paths only.
    assertNoPersonalData(result, "domainResolutionResult");
    return result;
  };

  // 4. Branch on the deterministic evaluation. Confirmation runs ONLY for a
  //    single probable candidate.
  if (evaluation.status === "not_found") {
    // Case 1 — zero discovery candidates. No confirmation call.
    return build("not_found", { reasons: ["NO_DISCOVERY_CANDIDATES"] });
  }

  if (evaluation.status === "unverified") {
    // Case 2 — candidates but no single probable selection. No confirmation call.
    const probableCount = evaluation.candidates.filter((c) => c.status === "probable").length;
    const reason: DomainResolutionReasonCode =
      probableCount > 1 ? "MULTIPLE_PROBABLE_CANDIDATES" : "NO_PROBABLE_CANDIDATE";
    return build("unverified", { reasons: [reason] });
  }

  // Case 3 — evaluation.status === "probable". Invariant checks first.
  const selected = assertProbableSelection(evaluation);

  // Confirm the single probable candidate exactly once. Confirmation reads the
  // canonical origin from the evaluation result directly — we do NOT reconstruct
  // or re-normalize it. Budget/enablement errors and caller cancellation
  // propagate; provider failures are reduced to `unverified` inside.
  const confirmation = await confirmCompanyDomain(
    company,
    evaluation,
    { provider: deps.confirmationProvider, budget: deps.confirmationBudget },
    { signal: options?.signal },
  );

  switch (confirmation.status) {
    case "confirmed": {
      const confirmedOrigin = assertConfirmedOrigin(confirmation, selected);
      return build("confirmed", {
        confirmedOrigin,
        selectedCandidate: selected,
        confirmation,
        reasons: ["CONFIRMATION_CONFIRMED"],
        sourceOrigins: confirmation.sourceOrigins,
      });
    }
    case "conflict":
      // Never fall back to another candidate; never confirm again.
      return build("conflict", {
        selectedCandidate: selected,
        confirmation,
        reasons: ["CONFIRMATION_CONFLICT"],
        sourceOrigins: [],
      });
    case "unverified":
      return build("unverified", {
        selectedCandidate: selected,
        confirmation,
        reasons: ["CONFIRMATION_UNVERIFIED"],
        sourceOrigins: [],
      });
    default:
      throw new DomainResolutionInvariantError("unexpected confirmation status");
  }
}
