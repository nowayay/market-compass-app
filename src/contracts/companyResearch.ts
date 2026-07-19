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
export const COMPANY_RESEARCH_VERSION = "1.0.0-stage3";

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

export type ResearchSourceProvider = "krs" | "openai_web_search";

export type ResearchSourceType =
  | "official_registry"
  | "official_company_website"
  | "official_company_document"
  | "government"
  | "discovery_source";

export type ResearchSourceAuthority =
  | "primary"
  | "authoritative_secondary"
  | "secondary";

/**
 * A provenance record. Stores only privacy-safe metadata about where a fact came
 * from — never the raw content of the source response, and never an upstream
 * title, snippet, full path, query string or fragment.
 *
 * The public `url` is ALWAYS origin-only (scheme + host, e.g.
 * `https://company.example`) or `null`. Exact page URLs never appear here — they
 * exist only transiently, in memory, during a single research request (see the
 * server-only request-scoped types) and are reduced to their origin before any
 * source object is created.
 *
 * Source-to-fact attribution is NOT represented here anymore. The single
 * authoritative attribution mechanism is `evidence.facts` (see FactEvidence).
 */
export interface ResearchSource {
  id: string;
  provider: ResearchSourceProvider;
  type: ResearchSourceType;
  authority: ResearchSourceAuthority;
  /** Origin only (scheme + host), e.g. `https://company.example`, or null. */
  url: string | null;
  /** Hostname only, e.g. `company.example`, or null when not applicable. */
  domain: string | null;
  retrievedAt: string;
  publishedAt: string | null;
}

/** How strongly a source backs a fact. */
export type FactSupport = "direct" | "corroborating";

/**
 * How a fact's value was obtained:
 * - `registry`    — copied verbatim from an official registry (KRS),
 * - `extracted`   — extracted as a discrete value from a source,
 * - `normalized`  — extracted then normalized to a canonical form,
 * - `synthesized` — combined from multiple accepted facts,
 * - `derived`     — computed deterministically by application code.
 */
export type FactDerivation =
  | "registry"
  | "extracted"
  | "normalized"
  | "synthesized"
  | "derived";

/** The profile field a piece of evidence attributes to. */
export interface FactEvidenceTarget {
  /** Dotted profile path, e.g. `company.identity.legalName`. */
  path: string;
  /** Id of the specific array item the fact targets, or null for a scalar. */
  itemId: string | null;
}

/**
 * Links a single material fact in the company profile to the source(s) that back
 * it. This is the ONE authoritative source-to-fact attribution mechanism. It
 * contains no natural-person data and no free-text description.
 */
export interface FactEvidence {
  id: string;
  target: FactEvidenceTarget;
  /** At least one source id; ids are unique within a single evidence entry. */
  sourceIds: string[];
  support: FactSupport;
  derivation: FactDerivation;
  /** 0..1 confidence in the fact. */
  confidence: number;
  /** ISO datetime the fact was verified/retrieved. */
  verifiedAt: string;
}

/** The evidence section attached to a completed research response. */
export interface ResearchEvidence {
  facts: FactEvidence[];
}

export type IdentityConfidenceLevel = "high" | "medium" | "low";

/** How a conflict between sources was (or was not) resolved. */
export type ConflictResolution =
  | "krs_preferred"
  | "official_source_preferred"
  | "unresolved";

/**
 * A structured, code-driven record of a data conflict. Carries only stable codes
 * and paths — never arbitrary free text (which could smuggle personal data).
 */
export interface ResearchConflict {
  /** Stable machine code, e.g. `legal_name_mismatch`. */
  code: string;
  /** Dotted profile path the conflict concerns. */
  targetPath: string;
  sourceIds: string[];
  resolution: ConflictResolution;
}

/**
 * A structured, code-driven warning. Carries only a stable code and an optional
 * path — no arbitrary message/description text.
 */
export interface ResearchWarning {
  /** Stable machine code, e.g. `query_name_mismatch`. */
  code: string;
  targetPath: string | null;
}

export interface ResearchQuality {
  identityConfidence: {
    level: IdentityConfidenceLevel;
    score: number;
  };
  completenessScore: number;
  missingFields: string[];
  conflicts: ResearchConflict[];
  warnings: ResearchWarning[];
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
  /** Authoritative source-to-fact attribution for every material fact. */
  evidence: ResearchEvidence;
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
  // Dashboard — AI expansion analysis stage.
  | "EXPANSION_ANALYSIS_ERROR"
  | "EXPANSION_ANALYSIS_TIMEOUT"
  | "INVALID_EXPANSION_ANALYSIS_RESPONSE";
// NOTE: official domain-discovery error codes are intentionally NOT part of this
// public union. They are internal (`DomainDiscoveryErrorCode` in
// server/company-research/domain-discovery/errors.ts) until the flow is wired
// into the public API with a deliberate mapping.

/** Stable JSON error envelope for technical failures. */
export interface CompanyResearchErrorResponse {
  error: {
    code: CompanyResearchErrorCode;
    message: string;
  };
  requestId: string;
}
