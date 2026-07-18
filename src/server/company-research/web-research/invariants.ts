/**
 * Pure defensive cross-stage invariants for Full Company Web Research
 * Orchestration.
 *
 * Each lower stage already validates its OWN internal consistency in full
 * (domain resolution, business research and — most exhaustively — profile
 * assembly, which re-validates the confirmed-resolution contract and the
 * business-research/confirmed-target contract before it ever builds a profile).
 * These guards do NOT repeat that work. They only catch the narrow slice of
 * broken CROSS-STAGE contract a malformed/adversarial injected dependency could
 * produce that a single stage's own validation cannot see in isolation — e.g. a
 * `researchCompanyBusiness` double that ignores the confirmed-domain gate, or a
 * `resolveCompanyDomain` double that returns a "confirmed" result for a
 * DIFFERENT company than the one supplied. An impossible dependency result
 * throws `CompanyWebResearchInvariantError` — it is NEVER silently repaired or
 * downgraded. Pure and synchronous; no network.
 */
import { BusinessResearchInvariantError } from "../business-research/errors.ts";
import { assertConfirmedResolutionTarget } from "../business-research/invariants.ts";
import { normalizeKrsValue, normalizeNipValue, normalizeRegonValue } from "../domain-evaluation/normalizeDomainSignals.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { CompanyWebResearchInvariantError } from "./errors.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { StructuredBusinessResearchResult } from "../business-research/types.ts";
import type { KrsCompany } from "../types.ts";

const fail = (message: string): never => {
  throw new CompanyWebResearchInvariantError(message);
};

type IdentifierType = "krs" | "nip" | "regon";

const NORMALIZE_BY_TYPE: Record<IdentifierType, (raw: string) => string | null> = {
  krs: normalizeKrsValue,
  nip: normalizeNipValue,
  regon: normalizeRegonValue,
};

/** The three matched-identifier signal fields, keyed by identifier type. */
function signalByType(signals: { matchedKrs: string | null; matchedNip: string | null; matchedRegon: string | null }): Record<IdentifierType, string | null> {
  return { krs: signals.matchedKrs, nip: signals.matchedNip, regon: signals.matchedRegon };
}

/**
 * Asserts a CONFIRMED domain resolution actually belongs to the SUPPLIED
 * company — not merely that it is internally self-consistent (that is already
 * exhaustively checked by `assertConfirmedResolutionTarget`, reused here rather
 * than duplicated).
 *
 * Every check uses ONLY the existing repository identifier normalizers
 * (`normalizeKrsValue` / `normalizeNipValue` / `normalizeRegonValue`) — no new
 * normalization rule is invented — and is applied INDEPENDENTLY per identifier
 * type (KRS/NIP/REGON never cross-substitute for each other), and SYMMETRICALLY
 * across the supplied company, the SELECTED candidate and the sole probable
 * EVALUATED candidate — presence on EITHER candidate, claimed or not, is enough
 * to trigger full agreement:
 *
 *   1. If NEITHER the selected nor the evaluated candidate carries a value for
 *      a given identifier type, that is allowed ONLY when the type is not
 *      claimed in `confirmation.verifiedIdentifiers` (a claim with nothing
 *      behind it on either candidate is rejected).
 *   2. If EITHER candidate carries a (non-null) value for that type:
 *        - the supplied company must contain the corresponding identifier and
 *          it must normalize successfully;
 *        - BOTH the selected and the evaluated candidate must contain the
 *          value (one present and the other absent is rejected — an unclaimed
 *          value is never exempt from this);
 *        - both values must normalize successfully;
 *        - all three (company, selected, evaluated) must agree once
 *          normalized.
 *   3. A type explicitly claimed in `verifiedIdentifiers` is additionally
 *      guaranteed to fall into case 2 above (a claim can never be satisfied by
 *      "neither candidate has a value").
 *
 * This is deliberately symmetric: a claimed-verified NIP plus a foreign,
 * UNCLAIMED evaluated-only REGON is rejected exactly like a foreign selected
 * signal would be — an unclaimed signal is never a free pass, on either
 * candidate.
 *
 * A mismatch throws `CompanyWebResearchInvariantError` with a message that
 * never contains an identifier value, type, legal name or domain. A
 * non-confirmed resolution has nothing to own and is not checked.
 */
export function assertDomainResolutionBelongsToCompany(
  company: KrsCompany,
  domainResolution: CompanyDomainResolutionResult,
): void {
  if (domainResolution.status !== "confirmed") return;

  try {
    assertConfirmedResolutionTarget(domainResolution);
  } catch (cause) {
    if (cause instanceof BusinessResearchInvariantError) {
      fail("confirmed resolution failed structural validation");
    }
    throw cause;
  }

  // Guaranteed non-null by `assertConfirmedResolutionTarget` above.
  const selected = domainResolution.selectedCandidate!;
  const confirmation = domainResolution.confirmation!;

  // The sole probable EVALUATED candidate. `assertConfirmedResolutionTarget`
  // already proved it exists, is unique, and field-matches `selected` by
  // origin+domain — but NOT that its `signals` agree, which is exactly what
  // the symmetric check below must additionally verify (a hostile stub could
  // give the selected and evaluated "copies" of the same candidate different
  // signals).
  const probable = domainResolution.evaluatedCandidates.filter((c) => c.status === "probable");
  if (probable.length !== 1) {
    fail("confirmed resolution does not have exactly one probable evaluated candidate");
  }
  const evaluated = probable[0];

  const companyIdentifier: Record<IdentifierType, string | undefined> = {
    krs: company.krs,
    nip: company.nip,
    regon: company.regon,
  };
  const selectedSignal = signalByType(selected.signals);
  const evaluatedSignal = signalByType(evaluated.signals);
  const claimed = new Set(confirmation.verifiedIdentifiers);

  for (const type of ["krs", "nip", "regon"] as const) {
    const selectedRaw = selectedSignal[type];
    const evaluatedRaw = evaluatedSignal[type];

    // 1 — neither candidate carries a value for this type.
    if (selectedRaw === null && evaluatedRaw === null) {
      if (claimed.has(type)) {
        fail("confirmed resolution verifies an identifier without a matching candidate signal");
      }
      continue;
    }

    // 2 — presence on EITHER candidate (claimed or not) requires full,
    //     symmetric agreement across company/selected/evaluated.
    if (selectedRaw === null) {
      fail("confirmed candidate signal is present on only one of the selected/evaluated candidates");
    }
    if (evaluatedRaw === null) {
      fail("confirmed candidate signal is present on only one of the selected/evaluated candidates");
    }

    const companyValue = companyIdentifier[type];
    if (companyValue === undefined) {
      fail("confirmed candidate signal claims an identifier the supplied company does not have");
    }

    const normalize = NORMALIZE_BY_TYPE[type];
    const normalizedCompany = normalize(companyValue!);
    if (normalizedCompany === null) {
      fail("confirmed candidate signal claims an identifier the supplied company cannot normalize");
    }
    const normalizedSelected = normalize(selectedRaw!);
    if (normalizedSelected === null) {
      fail("confirmed candidate signal cannot be normalized");
    }
    const normalizedEvaluated = normalize(evaluatedRaw!);
    if (normalizedEvaluated === null) {
      fail("confirmed candidate signal cannot be normalized");
    }

    if (normalizedSelected !== normalizedCompany || normalizedEvaluated !== normalizedCompany) {
      fail("confirmed candidate signal disagrees with the supplied company identifier");
    }
  }
}

/**
 * Asserts the Business Research contribution agrees with the domain-resolution
 * verdict it was given:
 *  - a non-confirmed resolution must have produced `skipped` business research
 *    (never `unverified`/`partial`/`completed` — a non-confirmed resolution can
 *    never yield accepted business facts),
 *  - accepted (`completed`/`partial`) research must carry the exact confirmed
 *    origin as its `researchedOrigin`.
 *
 * (A non-accepted result carrying a non-null `researchedOrigin` is already
 * rejected earlier, structurally, by business-research's OWN raw-shape
 * validator — that self-contained rule does not need `domainResolution` at
 * all, so it is not duplicated here.)
 */
export function assertBusinessResearchAgreesWithDomain(
  domainResolution: CompanyDomainResolutionResult,
  businessResearch: StructuredBusinessResearchResult,
): void {
  if (domainResolution.status !== "confirmed" && businessResearch.status !== "skipped") {
    fail("business research did not skip for a non-confirmed domain resolution");
  }

  const accepted = businessResearch.status === "completed" || businessResearch.status === "partial";
  if (accepted && businessResearch.researchedOrigin !== domainResolution.confirmedOrigin) {
    fail("accepted business research origin disagrees with the confirmed domain");
  }
}

/**
 * Recursively asserts that no string value anywhere in `value` is a URL carrying
 * a path, query or fragment — i.e. every URL-shaped string is already reduced to
 * a bare origin. This is DEFENSE-IN-DEPTH ONLY: every declared origin/URL field
 * on each stage's raw result is already validated directly (via
 * `safeOriginFromUrl`) by that stage's own strict shape validator (its
 * `resultSchema.ts`) before this ever runs. This catches a stray URL in a
 * place no declared field covers.
 */
export function assertNoExactPageUrl(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoExactPageUrl(item);
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) assertNoExactPageUrl(child);
    return;
  }
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    const safe = safeOriginFromUrl(value);
    if (safe === null || safe.origin !== value) {
      fail("result contains a URL that is not reduced to a bare origin");
    }
  }
}
