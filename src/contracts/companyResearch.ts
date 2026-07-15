/**
 * Public contracts for the Company Research API.
 *
 * This module is shared by both server and browser code, so it is pure types
 * plus a version constant — no runtime dependencies, no `server-only`, no
 * secrets. It intentionally contains NO person-related models: MarketCompass
 * never stores, transmits or returns data about natural persons (board members,
 * shareholders, representatives, beneficial owners, employees, etc.).
 */

/** Version stamped into every completed response's `meta`. */
export const COMPANY_RESEARCH_VERSION = "1.0.0-stage2";

/** Registry / provider-agnostic company identifiers (legal entity only). */
export interface CompanyIdentifiers {
  krs?: string;
  nip?: string;
  regon?: string;
}

/** Company-as-an-entity identity. No natural-person fields, ever. */
export interface CompanyIdentity {
  legalName: string;
  displayName?: string;
  aliases: string[];
  countryCode: string;
  identifiers: CompanyIdentifiers;
  legalForm?: string;
  legalStatus?: string;
  registrationDate?: string;
  foundedYear?: number;
}

/** Coarse location only — never a full street address. */
export interface CompanyLocation {
  city?: string;
  region?: string;
  countryCode: string;
}

export interface CompanyWebsite {
  url?: string;
  domain?: string;
  verified: boolean;
}

export interface CompanyIndustry {
  primaryCode?: string;
  secondaryCodes: string[];
  labels: string[];
  description?: string;
}

export interface CompanyBusiness {
  description?: string;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}

/** The full company profile returned by a completed research request. */
export interface CompanyProfile {
  identity: CompanyIdentity;
  location: CompanyLocation;
  website: CompanyWebsite;
  industry: CompanyIndustry;
  business: CompanyBusiness;
}

/** A single company match candidate (used by the future needs_confirmation flow). */
export interface CompanyCandidate {
  candidateId: string;
  legalName: string;
  displayName?: string;
  identifiers: CompanyIdentifiers;
  legalForm?: string;
  city?: string;
  region?: string;
  countryCode: string;
  foundedYear?: number;
  registrationDate?: string;
  website?: string;
  confidence: number;
  matchReasons: string[];
  sourceIds: string[];
}

export type ResearchSourceProvider =
  | "krs"
  | "company_website"
  | "annual_report"
  | "web";

export type ResearchSourceType =
  | "official_registry"
  | "first_party"
  | "financial_filing"
  | "government"
  | "news"
  | "other";

export type ResearchSourceAuthority = "primary" | "secondary";

/**
 * A provenance record. Stores only metadata about where a fact came from — never
 * the raw content of the source response.
 */
export interface ResearchSource {
  id: string;
  provider: ResearchSourceProvider;
  type: ResearchSourceType;
  title: string;
  url?: string;
  domain?: string;
  retrievedAt: string;
  publishedAt?: string;
  authority: ResearchSourceAuthority;
  /** Dotted field paths this source supports, e.g. `company.identity.legalName`. */
  supports: string[];
}

export type IdentityConfidenceLevel = "high" | "medium" | "low";

export interface ResearchQuality {
  identityConfidence: {
    level: IdentityConfidenceLevel;
    score: number;
  };
  completenessScore: number;
  missingFields: string[];
  conflicts: string[];
  warnings: string[];
  lastVerifiedAt?: string;
}

export type CustomerType = "b2b" | "b2c" | "b2b2c" | "mixed" | "unknown";

/** Inputs prepared for a later expansion-analysis stage. Mostly empty in stage 1. */
export interface ExpansionResearchInputs {
  currentMarkets: string[];
  productCategories: string[];
  customerType: CustomerType;
  salesChannels: string[];
  internationalExperience: string[];
  digitalPresence: string[];
  scaleSignals: string[];
  regulatoryConstraints: string[];
  operationalConstraints: string[];
  missingCriticalInputs: string[];
}

/** The normalized query echoed back in every response. */
export interface CompanyResearchQuery {
  name: string;
  countryCode: string;
  foundedYear?: number;
  krs?: string;
}

export interface CompanyResearchMeta {
  researchedAt: string;
  version: string;
}

export interface CompletedResponse {
  status: "completed";
  requestId: string;
  query: CompanyResearchQuery;
  company: CompanyProfile;
  expansionInputs: ExpansionResearchInputs;
  sources: ResearchSource[];
  quality: ResearchQuality;
  meta: CompanyResearchMeta;
}

export interface NeedsConfirmationResponse {
  status: "needs_confirmation";
  requestId: string;
  query: CompanyResearchQuery;
  candidates: CompanyCandidate[];
  sources: ResearchSource[];
}

export interface NotFoundResponse {
  status: "not_found";
  requestId: string;
  query: CompanyResearchQuery;
  message: string;
}

export type UnsupportedEntityReason = "natural_person_business";

export interface UnsupportedEntityTypeResponse {
  status: "unsupported_entity_type";
  requestId: string;
  query: CompanyResearchQuery;
  reason: UnsupportedEntityReason;
  message: string;
}

/** The domain response union (all non-error outcomes). */
export type CompanyResearchResponse =
  | CompletedResponse
  | NeedsConfirmationResponse
  | NotFoundResponse
  | UnsupportedEntityTypeResponse;

/** Stable technical error codes for the Company Research API. */
export type CompanyResearchErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "INVALID_KRS"
  | "REQUEST_BODY_TOO_LARGE"
  | "COMPANY_RESEARCH_PROVIDER_ERROR"
  | "COMPANY_RESEARCH_TIMEOUT"
  | "COMPANY_RESEARCH_CONFIGURATION_ERROR"
  | "COMPANY_RESEARCH_INTERNAL_ERROR"
  // Stage 2 — identification by name.
  | "COMPANY_IDENTIFICATION_ERROR"
  | "COMPANY_IDENTIFICATION_TIMEOUT"
  | "COMPANY_IDENTIFICATION_DISABLED"
  | "COMPANY_IDENTIFICATION_RATE_LIMITED"
  | "COMPANY_IDENTIFICATION_BUSY"
  | "INVALID_IDENTIFICATION_RESPONSE"
  | "INVALID_CANDIDATE_ID"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_QUERY_MISMATCH";

/** Stable JSON error envelope for technical failures. */
export interface CompanyResearchErrorResponse {
  error: {
    code: CompanyResearchErrorCode;
    message: string;
  };
  requestId: string;
}
