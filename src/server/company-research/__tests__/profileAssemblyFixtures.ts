/**
 * Shared offline fixtures for the Company Profile Assembly tests. All values are
 * invented; no real company or personal data is used. This is not a `*.test.ts`
 * file, so the node test runner never executes it directly.
 */
import { buildBusinessResult, buildSkippedResult } from "../business-research/buildBusinessResult.ts";
import type {
  RawBusinessFacts,
  StructuredBusinessResearchResult,
} from "../business-research/types.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { KrsCompany } from "../types.ts";

export const ORIGIN = "https://przyklad.example";
export const DOMAIN = "przyklad.example";
export const AT = "2026-07-17T00:00:00.000Z";
export const CLOCK_AT = "2026-07-18T12:00:00.000Z";

export function clock(): () => Date {
  return () => new Date(CLOCK_AT);
}

export function krsCompany(overrides: Partial<KrsCompany> = {}): KrsCompany {
  return {
    krs: "0000123456",
    legalName: "PRZYKŁADOWA SPÓŁKA SP. Z O.O.",
    legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
    nip: "5270000000",
    regon: "142000000",
    registrationDate: "2011-03-15",
    city: "WARSZAWA",
    region: "MAZOWIECKIE",
    countryCode: "PL",
    pkdPrimaryCode: "62.01.Z",
    pkdSecondaryCodes: ["63.11.Z"],
    pkdLabels: ["Działalność związana z oprogramowaniem"],
    registerType: "P",
    retrievedAt: AT,
    ...overrides,
  };
}

function probableCandidate(): EvaluatedDomainCandidate {
  return {
    origin: ORIGIN,
    domain: DOMAIN,
    status: "probable",
    score: 100,
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    signals: {
      matchedLegalName: null,
      matchedKrs: null,
      matchedNip: "5270000000",
      matchedRegon: null,
      matchedCity: null,
    },
  };
}

/** A fully valid confirmed domain-resolution result (passes every invariant). */
export function confirmedResolution(): CompanyDomainResolutionResult {
  const candidate = probableCandidate();
  return {
    status: "confirmed",
    confirmedOrigin: ORIGIN,
    selectedCandidate: candidate,
    evaluatedCandidates: [candidate],
    confirmation: {
      status: "confirmed",
      confirmedOrigin: ORIGIN,
      verifiedIdentifiers: ["nip"],
      reasons: [],
      conflicts: [],
      sourceOrigins: [ORIGIN],
    },
    reasons: ["CONFIRMATION_CONFIRMED"],
    sourceOrigins: [ORIGIN],
  };
}

/** A non-confirmed (not_found) resolution result — no usable website. */
export function notFoundResolution(): CompanyDomainResolutionResult {
  return {
    status: "not_found",
    confirmedOrigin: null,
    selectedCandidate: null,
    evaluatedCandidates: [],
    confirmation: null,
    reasons: ["NO_DISCOVERY_CANDIDATES"],
    sourceOrigins: [],
  };
}

/**
 * An unverified resolution result — confirmation ran on the sole probable
 * candidate but could not independently verify it. Matches the real
 * `resolveCompanyDomain` contract: the selected candidate always keeps the
 * `probable` status the evaluation stage gave it (confirmation only changes
 * the CONFIRMATION outcome, never the discovery/evaluation candidate status).
 */
export function unverifiedResolution(): CompanyDomainResolutionResult {
  const candidate: EvaluatedDomainCandidate = probableCandidate();
  return {
    status: "unverified",
    confirmedOrigin: null,
    selectedCandidate: candidate,
    evaluatedCandidates: [candidate],
    confirmation: {
      status: "unverified",
      confirmedOrigin: null,
      verifiedIdentifiers: [],
      reasons: [],
      conflicts: [],
      sourceOrigins: [],
    },
    reasons: ["CONFIRMATION_UNVERIFIED"],
    sourceOrigins: [],
  };
}

const FULL_RAW: RawBusinessFacts = {
  industryDescription: "Tworzenie oprogramowania na zamówienie",
  productsServices: ["Aplikacje webowe", "Aplikacje mobilne"],
  customerSegments: ["MŚP", "Startupy"],
  operatingMarkets: ["Polska", "Niemcy"],
  ambiguityCodes: [],
};

/** A completed business-research result for the confirmed origin. */
export function completedBusiness(
  raw: Partial<RawBusinessFacts> = {},
): StructuredBusinessResearchResult {
  return buildBusinessResult({
    raw: { ...FULL_RAW, ...raw },
    sourceOrigins: [ORIGIN],
    targetOrigin: ORIGIN,
    targetDomain: DOMAIN,
    researchedAt: AT,
  });
}

/** A partial business-research result (one category unavailable). */
export function partialBusiness(): StructuredBusinessResearchResult {
  return completedBusiness({ customerSegments: [] });
}

/**
 * A completed business-research result whose attested source is a specific origin
 * (e.g. the `www.` counterpart) while the researched origin stays the apex ORIGIN.
 * Used to prove the website source is selected for the exact confirmed origin.
 */
export function completedBusinessAtSourceOrigin(
  sourceOrigin: string,
): StructuredBusinessResearchResult {
  return buildBusinessResult({
    raw: { ...FULL_RAW },
    sourceOrigins: [sourceOrigin],
    targetOrigin: ORIGIN,
    targetDomain: DOMAIN,
    researchedAt: AT,
  });
}

/**
 * A partial business result carrying only a single product/service, so the
 * deterministic description's first sentence is exactly the legal name (used to
 * exercise sentence-termination through the real assembler).
 */
export function productsOnlyBusiness(): StructuredBusinessResearchResult {
  return buildBusinessResult({
    raw: {
      industryDescription: null,
      productsServices: ["Usługi"],
      customerSegments: [],
      operatingMarkets: [],
      ambiguityCodes: [],
    },
    sourceOrigins: [ORIGIN],
    targetOrigin: ORIGIN,
    targetDomain: DOMAIN,
    researchedAt: AT,
  });
}

/** A partial business result carrying only a (controllable) industry description. */
export function industryOnlyBusiness(industryDescription: string): StructuredBusinessResearchResult {
  return buildBusinessResult({
    raw: {
      industryDescription,
      productsServices: [],
      customerSegments: [],
      operatingMarkets: [],
      ambiguityCodes: [],
    },
    sourceOrigins: [ORIGIN],
    targetOrigin: ORIGIN,
    targetDomain: DOMAIN,
    researchedAt: AT,
  });
}

/** An unverified business-research result (no accepted facts). */
export function unverifiedBusiness(): StructuredBusinessResearchResult {
  return {
    status: "unverified",
    researchedOrigin: null,
    facts: {
      industryDescription: null,
      productsServices: [],
      customerSegments: [],
      operatingMarkets: [],
    },
    sources: [],
    evidence: [],
    reasons: ["INSUFFICIENT_BUSINESS_EVIDENCE"],
    conflicts: [],
  };
}

/** A skipped business-research result (domain not confirmed). */
export function skippedBusiness(): StructuredBusinessResearchResult {
  return buildSkippedResult();
}
