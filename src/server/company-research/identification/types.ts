/**
 * Internal types for the "identify company by name" flow.
 *
 * Pure types only (no runtime imports) so leaf logic modules and their tests can
 * depend on this without pulling in any server-only or bundler-only code. None
 * of these models carry natural-person data.
 */
import type { KrsCompany } from "../types";
import type { SafeDiscoveredSource } from "./webSourceSecurity";

/**
 * A raw, web-discovered company proposal. It is INTERNAL and is NOT yet a public
 * CompanyCandidate — its legal data is unverified until confirmed against KRS.
 * Only company-as-entity fields are allowed; no natural-person data, ever, and
 * no model-asserted website/sources (those are derived from tool metadata).
 */
export interface DiscoveredCompanyCandidate {
  legalName: string;
  /** Exactly 10 digits (normalized). */
  krs: string;
  city?: string;
  countryCode: "PL";
  /** A hint only — never used as a confirmed fact or a confidence signal. */
  foundedYear?: number;
}

/** The result of a discovery: candidates + response-level web-search sources. */
export interface DiscoveryResult {
  candidates: DiscoveredCompanyCandidate[];
  /** Real sources from web-search metadata (origin/hostname only). */
  sources: SafeDiscoveredSource[];
}

/** The minimal, privacy-safe query handed to the identification provider. */
export interface IdentificationQuery {
  name: string;
  countryCode: string;
  foundedYear?: number;
}

/**
 * Discovers potential company candidates by name via web search. Implementations
 * MUST return only runtime-validated, person-data-free discovered candidates and
 * real (tool-attested) sources, and must never leak raw model output, prompts,
 * page content, snippets or model-asserted URLs.
 */
export interface CompanyIdentificationProvider {
  readonly name: string;
  discoverCandidates(
    query: IdentificationQuery,
    signal?: AbortSignal,
  ): Promise<DiscoveryResult>;
}

/** A discovered candidate confirmed against the official KRS registry. */
export interface VerifiedCandidate {
  krsCompany: KrsCompany;
  discovered: DiscoveredCompanyCandidate;
}

export type MatchStrength = "exact" | "strong" | "weak";

/** A verified candidate with a deterministic, code-computed score. */
export interface ScoredCandidate {
  krsCompany: KrsCompany;
  discovered: DiscoveredCompanyCandidate;
  strength: MatchStrength;
  confidence: number;
  matchReasons: string[];
}

export type IdentificationDecision = "completed" | "needs_confirmation" | "not_found";
