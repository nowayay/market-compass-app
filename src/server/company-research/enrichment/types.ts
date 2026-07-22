/**
 * Internal types for the Company Profile Enrichment fallback.
 *
 * Pure types only (no runtime imports) so the provider and its tests can depend
 * on this without pulling in any server-only or bundler-only code.
 *
 * Enrichment is an OPTIONAL, best-effort fallback used only when the assembled
 * profile is legal-only (or otherwise missing the important business fields).
 * It reuses the existing OpenAI client/config (no second AI provider) and
 * returns ONLY company-as-entity facts — never natural-person data, never
 * financial figures.
 */

/** The allowlisted input sent to the enrichment provider. */
export interface CompanyEnrichmentInput {
  legalName: string;
  krs: string;
  nip?: string;
  /** An identification hint or an already-known value — never authoritative. */
  foundedYear?: number;
  /** A confirmed official website origin, when already known. */
  website?: string;
}

/**
 * The structured facts the model may report. `description`/`industry` are
 * empty strings (never omitted) when the model found no reliable evidence;
 * `foundedYear`/`website` are `null` in the same case.
 */
export interface CompanyEnrichmentFacts {
  description: string;
  industry: string;
  foundedYear: number | null;
  website: string | null;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}

/**
 * Researches a single already-identified company with ONE structured web-search
 * call. Implementations must never accept or return natural-person data,
 * invented financial figures, or an exact (non-origin) source page URL.
 */
export interface CompanyEnrichmentProvider {
  readonly name: string;
  enrich(
    input: CompanyEnrichmentInput,
    options?: { signal?: AbortSignal },
  ): Promise<CompanyEnrichmentFacts>;
}
