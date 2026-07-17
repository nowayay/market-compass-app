import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import { buildBusinessResearchInput } from "./buildBusinessResearchInput.ts";
import { buildBusinessResult, buildSkippedResult } from "./buildBusinessResult.ts";
import { BusinessResearchPrivacyError } from "./errors.ts";
import { assertConfirmedResolutionTarget } from "./invariants.ts";
import type {
  BusinessResearchRequest,
  ResearchBusinessDeps,
  StructuredBusinessResearchResult,
} from "./types.ts";

/**
 * Runs the assertion and converts a personal-data leak into a business-research
 * privacy error (which invalidates the WHOLE result — never a partial drop).
 */
function guardPersonalData(value: unknown, path: string): void {
  try {
    assertNoPersonalData(value, path);
  } catch (cause) {
    if (cause instanceof PersonalDataLeakError) {
      throw new BusinessResearchPrivacyError(undefined, cause);
    }
    throw cause;
  }
}

/**
 * Internal Structured Business Research orchestration.
 *
 * Flow: confirmed-domain gate → build + privacy-check allowlisted input →
 * acquire the dedicated budget → EXACTLY ONE provider call → privacy-check the
 * provider output → deterministic ambiguity/normalization/status/evidence
 * assembly → privacy-check the final result → release budget in `finally`.
 *
 * Boundaries:
 *  - Non-confirmed resolution → `skipped` with NO budget and NO provider call.
 *  - Impossible confirmed states throw a strict invariant error (never silently
 *    downgraded to skipped/unverified).
 *  - Operational failures (disabled / rate-limited / busy / timeout / provider
 *    failure / refusal / incomplete / invalid / privacy violation) THROW; valid
 *    no-fact output is `unverified`, not an error. Caller cancellation propagates.
 *  - It owns ONLY its dedicated budget and never touches discovery/confirmation
 *    budgets. It never calls domain resolution, `researchCompany`, routes or the
 *    dashboard, and never sets `company.website` / industry codes / description /
 *    expansionInputs.
 */
export async function researchCompanyBusiness(
  request: BusinessResearchRequest,
  deps: ResearchBusinessDeps,
  options?: { signal?: AbortSignal },
): Promise<StructuredBusinessResearchResult> {
  // 1. Confirmed-domain gate — no budget / provider call for a non-confirmed domain.
  if (request.domainResolution.status !== "confirmed") {
    return buildSkippedResult();
  }

  // Validate all confirmed invariants BEFORE acquiring the budget.
  const target = assertConfirmedResolutionTarget(request.domainResolution);

  // 2. Build + privacy-check the allowlisted input (identifiers are withheld).
  const input = buildBusinessResearchInput(request.company, target);
  guardPersonalData(input, "businessResearchInput");

  // 3. Acquire the dedicated budget (disabled / rate-limited / busy THROW here).
  const release = deps.budget.acquire();
  try {
    // 4. Exactly one provider call. Operational errors propagate; caller
    //    cancellation propagates distinctly (the provider re-throws it).
    const providerResult = await deps.provider.researchBusiness(input, { signal: options?.signal });

    // 5. Provider-boundary privacy guard (defense-in-depth). The OpenAI parser
    //    already privacy-checks its raw output, but the provider INTERFACE allows
    //    injected/future implementations that could return personal data
    //    directly. Guard the COMPLETE provider facts here — BEFORE normalization,
    //    ambiguity handling and any category removal in buildBusinessResult — so
    //    a personal-data leak can never be hidden by a later fact drop. A
    //    violation throws BusinessResearchPrivacyError while the budget is still
    //    held (released by the `finally` below).
    guardPersonalData(providerResult.facts, "businessResearchProviderOutput");

    const researchedAt = deps.now().toISOString();
    const result = buildBusinessResult({
      raw: providerResult.facts,
      sourceOrigins: providerResult.sourceOrigins,
      targetOrigin: target.targetOrigin,
      targetDomain: target.targetDomain,
      researchedAt,
    });

    // 6. Privacy-check the final result (covers the normalized facts too).
    guardPersonalData(result, "businessResearchResult");
    return result;
  } finally {
    release();
  }
}
