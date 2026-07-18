import { assertValidBusinessResearchResultShape } from "../business-research/resultSchema.ts";
import { assertValidDomainResolutionResultShape } from "../domain-resolution/resultSchema.ts";
import { assertValidKrsCompany } from "../profile-assembly/invariants.ts";
import { assertValidProfileAssemblyResultShape } from "../profile-assembly/resultSchema.ts";
import { assertProfileAssemblyResultMatchesInputs } from "../profile-assembly/validateAssemblyResult.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { createTrackedAssemblyClock } from "./assemblyClock.ts";
import { cloneCompanyWebResearchResult } from "./clone.ts";
import { CompanyWebResearchInvariantError } from "./errors.ts";
import {
  assertBusinessResearchAgreesWithDomain,
  assertDomainResolutionBelongsToCompany,
  assertNoExactPageUrl,
} from "./invariants.ts";
import type {
  CompanyWebResearchDeps,
  CompanyWebResearchRequest,
  CompanyWebResearchResult,
} from "./types.ts";

/**
 * Internal Full Company Web Research orchestration.
 *
 * Chains the three already-implemented internal stages for an already
 * KRS-sanitized company:
 *
 *   sanitized KrsCompany
 *     → resolveCompanyDomain      (≤1 network-capable call)
 *     → researchCompanyBusiness   (≤1 network-capable call; skipped unless the
 *                                   domain is confirmed)
 *     → assembleCompanyProfile    (pure, deterministic)
 *     → one internal pipeline result
 *
 * Every stage's RAW return value is treated as UNTRUSTED input and validated
 * fail-closed, in this exact order, BEFORE it is used for anything else and
 * BEFORE any cloning happens:
 *   1. strict runtime shape (exact keys — an unexpected/hostile field such as a
 *      smuggled `contactPerson`/`email`/`sourceSnippet`/exact page URL is
 *      REJECTED, never silently dropped by a permissive clone) — this also
 *      validates every declared origin/URL field directly,
 *   2. the personal-data guard, run over the RAW (pre-clone) value under the
 *      stage's own established root path (so the approved legal-name allowlist
 *      keeps matching exactly as it does inside the stage itself),
 *   3. cross-stage / ownership invariants this orchestrator uniquely owns.
 * Only once every raw output has passed all three does the pipeline move on —
 * detachment (cloning) happens LAST, over the combined, already-validated result.
 *
 * Boundaries:
 *  - It makes NO network call itself, creates NO OpenAI client, acquires NO
 *    budget, reads NO environment variable, and performs NO retries — every
 *    network-capable/budget-owning concern belongs to the injected stage
 *    functions.
 *  - It calls every stage AT MOST ONCE, in the exact order above, and never
 *    calls a later stage once an earlier one has thrown.
 *  - It performs NO additional KRS lookup — `company` is the single sanitized
 *    input, reused unchanged through every stage.
 *  - It does NOT catch/translate stage errors: typed errors from domain
 *    resolution, business research, profile assembly or caller cancellation
 *    propagate unchanged (the exact same error instance). It raises its OWN
 *    `CompanyWebResearchInvariantError` ONLY for a cross-stage contract an
 *    individual stage cannot see in isolation (see `invariants.ts`) — never for
 *    an ordinary outcome.
 *  - It is INTERNAL: it does not touch HTTP handlers, routes, `researchCompany`,
 *    the public response contract/schema, the dashboard, persistence or
 *    caching, and is not activated in any request path.
 */
export async function orchestrateCompanyWebResearch(
  request: CompanyWebResearchRequest,
  deps: CompanyWebResearchDeps,
): Promise<CompanyWebResearchResult> {
  const { company, signal } = request;

  // 1. Validate the sanitized KRS input with the existing trusted runtime rule.
  assertValidKrsCompany(company);

  // 2. Resolve the official domain — exactly once. The supplied signal is
  //    preserved and forwarded unchanged.
  const domainResolutionRaw = await deps.resolveCompanyDomain(company, { signal });
  const domainResolution = assertValidDomainResolutionResultShape(domainResolutionRaw);
  assertNoPersonalData(domainResolution, "domainResolutionResult");
  assertDomainResolutionBelongsToCompany(company, domainResolution);

  // 3. Business research receives the EXACT domain-resolution result validated
  //    above — exactly once, with the same signal.
  const businessResearchRaw = await deps.researchCompanyBusiness({ company, domainResolution }, { signal });
  const businessResearch = assertValidBusinessResearchResultShape(businessResearchRaw);
  assertNoPersonalData(businessResearch, "businessResearchResult");
  assertBusinessResearchAgreesWithDomain(domainResolution, businessResearch);

  // 4. Profile assembly receives the SAME company and the exact validated
  //    upstream results — exactly once. It is pure/synchronous, so it carries no
  //    signal; the injected clock is threaded through a narrow TRACKED wrapper
  //    (never called by this orchestrator itself) so the exact instant Profile
  //    Assembly's own clock read produces can be used as the TRUSTED anchor for
  //    cross-stage validation below — never re-derived from Profile Assembly's
  //    own (untrusted) raw output, which a hostile dependency could otherwise
  //    forge self-consistently.
  const trackedClock = createTrackedAssemblyClock(deps.now);
  const profileAssemblyRaw = deps.assembleCompanyProfile(
    { company, domainResolution, businessResearch },
    { now: trackedClock.now },
  );
  if (trackedClock.callCount() !== 1) {
    throw new CompanyWebResearchInvariantError("assembly clock was not invoked exactly once");
  }
  const trustedAssembledAt = trackedClock.recordedTimestamp();
  if (trustedAssembledAt === null) {
    throw new CompanyWebResearchInvariantError("assembly clock did not produce a trusted recorded timestamp");
  }
  const profileAssembly = assertValidProfileAssemblyResultShape(profileAssemblyRaw);
  assertNoPersonalData(profileAssembly.profile, "company");
  assertNoPersonalData(
    { status: profileAssembly.status, sources: profileAssembly.sources, evidence: profileAssembly.evidence, reasons: profileAssembly.reasons },
    "companyProfileAssemblyResult",
  );
  assertProfileAssemblyResultMatchesInputs(
    { company, domainResolution, businessResearch },
    profileAssembly,
    trustedAssembledAt,
  );

  // 5. Every raw output has now passed shape, privacy and cross-stage
  //    validation. Only NOW detach (clone) the combined result — never aliasing
  //    `company` or any captured dependency-return object — and run the
  //    (defense-in-depth only) recursive URL scan over the final shape.
  const result = cloneCompanyWebResearchResult({ domainResolution, businessResearch, profileAssembly });
  assertNoExactPageUrl(result);

  return result;
}
