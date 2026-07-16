/**
 * Internal types for official-domain DISCOVERY.
 *
 * Pure types only (no runtime imports) so leaf logic modules and their tests can
 * depend on this without pulling in any server-only or bundler-only code. None
 * of these models carry natural-person data, and none expose an exact page URL —
 * only normalized origins survive.
 *
 * IMPORTANT: a candidate discovered here is NOT verified or official. Verification
 * (confirmed/probable scoring, `website.verified`) is a later, separate commit.
 * There is intentionally no `verified`, `official`, `confidence` or `score` field.
 */

/**
 * The allowlisted, company-level input sent to the discovery provider. Built
 * explicitly from KRS-verified data — never the public profile or raw request,
 * never a street address, and never any natural-person data.
 */
export interface CompanyDomainDiscoveryInput {
  legalName: string;
  /** Approved company aliases, if already available (empty for now). */
  aliases: string[];
  krs: string;
  nip: string | null;
  regon: string | null;
  city: string | null;
  region: string | null;
  countryCode: string;
  /** Included only when it aids disambiguation. */
  legalForm: string | null;
}

/** Discovered signals the model reported for a candidate (no confidence/verified). */
export interface DomainDiscoverySignals {
  matchedLegalName: string | null;
  matchedKrs: string | null;
  matchedNip: string | null;
  matchedRegon: string | null;
  matchedCity: string | null;
}

/**
 * A discovered domain candidate. INTERNAL to this stage. Carries only a
 * normalized origin (never an exact page URL) plus the model-reported signals
 * and the provider-attested source origins that back it.
 */
export interface DiscoveredDomainCandidate {
  /** Scheme + host only, e.g. `https://company.example`. */
  origin: string;
  /** Hostname only, e.g. `company.example`. */
  domain: string;
  signals: DomainDiscoverySignals;
  /**
   * Provider-attested source ORIGINS that back this candidate. Each value is
   * origin-only (scheme + host, no path/query/fragment) and corresponds to
   * web-search metadata — these are origins, not opaque identifiers.
   */
  sourceOrigins: string[];
}

/** The result of one domain discovery: a bounded list of candidates. */
export interface CompanyDomainDiscoveryResult {
  candidates: DiscoveredDomainCandidate[];
}

/**
 * Discovers official-domain CANDIDATES for an already KRS-confirmed company.
 * Implementations MUST send only the allowlisted input, accept a candidate only
 * when its origin is backed by real web-search source metadata, expose no exact
 * URLs, and never leak raw model output, prompts or page content.
 */
export interface CompanyDomainDiscoveryProvider {
  readonly name: string;
  discoverDomainCandidates(
    input: CompanyDomainDiscoveryInput,
    options?: { signal?: AbortSignal },
  ): Promise<CompanyDomainDiscoveryResult>;
}
