/**
 * Internal types for Structured Business Research.
 *
 * Pure types only (no runtime imports) so the orchestrator and its tests can
 * depend on this without pulling in any server-only or bundler-only code.
 *
 * Business research is INTERNAL: it is not wired into the public API, never sets
 * `company.website`, never populates `company.industry.primaryCode/secondaryCodes/
 * labels`, `company.business.description` or `expansionInputs`. It reuses the
 * EXISTING public `ResearchSource` / `FactEvidence` contracts (no duplicate types)
 * and carries only origin-only sources, strict enum codes and bounded facts.
 */
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { KrsCompany } from "../types.ts";
import type { BusinessResearchBudget } from "./businessResearchBudget.ts";
import type {
  BusinessResearchConflictCode,
  BusinessResearchReasonCode,
} from "./reasonCodes.ts";

/** The closed set of ambiguity codes the model may report. */
export type BusinessAmbiguityCode =
  | "multiple_legal_entities"
  | "group_scope_unclear"
  | "subsidiary_scope_unclear"
  | "third_party_listing_scope"
  | "contradictory_activities"
  | "contradictory_offerings"
  | "contradictory_customer_segments"
  | "contradictory_markets"
  | "insufficient_business_evidence"
  | "multiple_business_activities";

/**
 * The allowlisted input sent to the business-research provider. It contains ONLY
 * search-targeting hints (legal name + coarse location) and the confirmed target
 * domain/origin. It NEVER carries KRS/NIP/REGON, PKD codes, a raw KRS payload, a
 * profile, discovery/confirmation identifiers, a prior source URL, an exact page
 * URL, or any natural-person data.
 */
export interface BusinessResearchInput {
  legalName: string;
  city: string | null;
  region: string | null;
  countryCode: string;
  targetDomain: string;
  targetOrigin: string;
}

/** The raw, allowlist-mapped structured facts parsed from the model output. */
export interface RawBusinessFacts {
  industryDescription: string | null;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
  ambiguityCodes: BusinessAmbiguityCode[];
}

/** The processed provider result: raw facts + on-domain attested source origins. */
export interface BusinessResearchProviderResult {
  facts: RawBusinessFacts;
  sourceOrigins: string[];
}

/**
 * Researches business facts for a CONFIRMED official domain with ONE
 * domain-restricted web search. Implementations MUST send only the allowlisted
 * input, restrict the search to the target domain, accept sources only from real
 * web-search metadata, expose no exact URLs, and never leak raw model output,
 * prompts or page content.
 */
export interface CompanyBusinessResearchProvider {
  readonly name: string;
  researchBusiness(
    input: BusinessResearchInput,
    options?: { signal?: AbortSignal },
  ): Promise<BusinessResearchProviderResult>;
}

/** The four internal business-research verdicts. */
export type BusinessResearchStatus = "completed" | "partial" | "unverified" | "skipped";

/** The four researched business-fact targets (existing contract fields only). */
export interface StructuredBusinessFacts {
  industryDescription: string | null;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}

/** The single internal business-research result. INTERNAL only (no public wiring). */
export interface StructuredBusinessResearchResult {
  status: BusinessResearchStatus;
  researchedOrigin: string | null;
  facts: StructuredBusinessFacts;
  sources: ResearchSource[];
  evidence: FactEvidence[];
  reasons: BusinessResearchReasonCode[];
  conflicts: BusinessResearchConflictCode[];
}

/** The internal request (a KRS-confirmed company + its resolution result). */
export interface BusinessResearchRequest {
  company: KrsCompany;
  domainResolution: CompanyDomainResolutionResult;
}

/** Injected dependencies. The orchestrator owns ONLY its dedicated budget. */
export interface ResearchBusinessDeps {
  provider: CompanyBusinessResearchProvider;
  budget: BusinessResearchBudget;
  /** Injected clock for `retrievedAt` (testable determinism). */
  now: () => Date;
}
