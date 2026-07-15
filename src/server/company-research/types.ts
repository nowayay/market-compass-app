/**
 * Internal server-side types for Company Research.
 *
 * Pure types only (no runtime imports), so leaf logic modules and their tests
 * can depend on this without pulling in any bundler-only or server-only code.
 */

/**
 * The sanitized, company-only projection of a KRS extract. This is the ONLY
 * shape a provider is ever allowed to emit — it is produced by the allowlist
 * mapper and contains no natural-person data. Raw KRS responses never leave the
 * provider.
 */
export interface KrsCompany {
  krs: string;
  legalName: string;
  legalForm?: string;
  nip?: string;
  regon?: string;
  registrationDate?: string;
  city?: string;
  region?: string;
  countryCode: string;
  pkdPrimaryCode?: string;
  pkdSecondaryCodes: string[];
  pkdLabels: string[];
  registerType?: string;
  /** ISO timestamp of when the extract was fetched. */
  retrievedAt: string;
}

/** A fully normalized, validated research query. */
export interface NormalizedQuery {
  name: string;
  countryCode: string;
  foundedYear?: number;
  /** Exactly 10 digits when present. */
  krs?: string;
  selectedCandidateId?: string;
}

/**
 * A company data provider (e.g. the official KRS API). Implementations must
 * return only sanitized domain data and never surface, log or persist the raw
 * upstream response.
 */
export interface CompanyDataProvider {
  readonly name: string;
  /**
   * Fetch a company by its normalized (10-digit) KRS number.
   * Resolves to `null` when no such entity exists (not found).
   * Throws a typed CompanyResearch error on provider/timeout failures.
   */
  fetchByKrs(krs: string, signal?: AbortSignal): Promise<KrsCompany | null>;
}

/** Result of the identification step. */
export type IdentifyResult =
  | { kind: "found"; company: KrsCompany }
  | { kind: "not_found" }
  | { kind: "unsupported"; reason: "natural_person_business" };
