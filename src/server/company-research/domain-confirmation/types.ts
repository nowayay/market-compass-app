/**
 * Internal types for evidence-backed official-domain CONFIRMATION.
 *
 * Pure types only (no runtime imports) so leaf logic modules and their tests can
 * depend on this without pulling in any server-only or bundler-only code.
 *
 * The whole point of this stage: unlike DISCOVERY (which sends the expected
 * KRS/NIP/REGON to the model, so a returned identifier may be an echo of our own
 * input → only ever `probable`), CONFIRMATION WITHHOLDS the expected identifiers
 * and asks a domain-restricted search to report whatever registry identifiers are
 * literally published on the target domain. Backend code then compares those
 * INDEPENDENTLY-observed values with the KRS-verified ones. Because the model
 * never saw the expected value, a matching well-formed identifier cannot be an
 * echo — that is what earns `confirmed`.
 *
 * None of these models carry natural-person data, and none expose an exact page
 * URL — only normalized origins survive.
 */

/**
 * The allowlisted input sent to the confirmation provider. It contains ONLY
 * search-targeting hints (legal name + coarse location) and the single target
 * domain/origin. It NEVER carries krs/nip/regon, a raw KRS payload, a profile, an
 * exact source-page URL, or any natural-person data.
 */
export interface DomainConfirmationInput {
  legalName: string;
  city: string | null;
  region: string | null;
  countryCode: string;
  /** Target hostname, e.g. `company.example`. */
  targetDomain: string;
  /** Target origin (scheme + host), e.g. `https://company.example`. */
  targetOrigin: string;
}

/**
 * The KRS-verified EXPECTED identifiers, used ONLY in the deterministic backend
 * comparison AFTER the provider call. These MUST NEVER be forwarded to the model.
 */
export interface ExpectedCompanyIdentifiers {
  krs: string | null;
  nip: string | null;
  regon: string | null;
}

/**
 * Independently-found identifiers after strict deterministic normalization.
 * Each list holds only valid, normalized, de-duplicated values (max 3). A
 * `malformed*` flag is set when the model returned a NON-empty value that failed
 * normalization — a malformed value never confirms and never conflicts, it only
 * downgrades the outcome to `unverified`.
 */
export interface NormalizedFoundIdentifiers {
  krs: string[];
  nip: string[];
  regon: string[];
  malformedKrs: boolean;
  malformedNip: boolean;
  malformedRegon: boolean;
}

/**
 * The processed provider result: normalized found identifiers plus the
 * provider-attested source ORIGINS that are on the target domain (origin-only,
 * deduplicated). No exact URLs, titles, snippets or page content.
 */
export interface DomainConfirmationProviderResult {
  found: NormalizedFoundIdentifiers;
  sourceOrigins: string[];
}

import type {
  DomainConfirmationConflictCode,
  DomainConfirmationReasonCode,
} from "./reasonCodes.ts";

/**
 * The evidence-backed confirmation status. This module is the SOLE producer of
 * `confirmed` in the whole codebase (discovery/evaluation deliberately cannot
 * reach it).
 */
export type DomainConfirmationStatus = "confirmed" | "conflict" | "unverified";

/** The deterministic confirmation result. INTERNAL only (no public API wiring). */
export interface DomainConfirmationResult {
  status: DomainConfirmationStatus;
  /** The canonical target origin, set only when `confirmed`; otherwise null. */
  confirmedOrigin: string | null;
  /** Which registry identifiers were independently verified (only when confirmed). */
  verifiedIdentifiers: Array<"krs" | "nip" | "regon">;
  reasons: DomainConfirmationReasonCode[];
  conflicts: DomainConfirmationConflictCode[];
  /** Origin-only, provider-attested, on-target-domain sources. */
  sourceOrigins: string[];
}

/**
 * Confirms an already-`probable` official domain for a KRS-confirmed company.
 * Implementations MUST send only the allowlisted input (never the expected
 * identifiers), restrict the web search to the target domain, accept sources only
 * from real web-search metadata, expose no exact URLs, and never leak raw model
 * output, prompts or page content.
 */
export interface CompanyDomainConfirmationProvider {
  readonly name: string;
  confirmDomain(
    input: DomainConfirmationInput,
    options?: { signal?: AbortSignal },
  ): Promise<DomainConfirmationProviderResult>;
}
