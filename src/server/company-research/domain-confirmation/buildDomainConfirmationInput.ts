import type { KrsCompany } from "../types.ts";
import type { DomainConfirmationInput, ExpectedCompanyIdentifiers } from "./types.ts";

/** The already-`probable` candidate being confirmed (origin + hostname only). */
export interface ConfirmationTarget {
  /** Scheme + host, e.g. `https://company.example`. */
  origin: string;
  /** Hostname only, e.g. `company.example`. */
  domain: string;
}

/**
 * Builds the ALLOWLISTED confirmation input from a FRESH object.
 *
 * It copies only search-targeting hints (legal name + coarse location) and the
 * single target domain/origin. It explicitly does NOT include krs/nip/regon, the
 * raw KRS payload, pkd codes, register type, retrievedAt, a street address, an
 * exact source-page URL, or any natural-person data. The expected identifiers are
 * withheld on purpose — they are used only in the deterministic backend
 * comparison AFTER the provider call (see `buildExpectedIdentifiers`).
 */
export function buildDomainConfirmationInput(
  company: KrsCompany,
  target: ConfirmationTarget,
): DomainConfirmationInput {
  return {
    legalName: company.legalName,
    city: company.city ?? null,
    region: company.region ?? null,
    countryCode: company.countryCode,
    targetDomain: target.domain,
    targetOrigin: target.origin,
  };
}

/**
 * Extracts the KRS-verified EXPECTED identifiers used ONLY by the deterministic
 * evaluator, after the provider call. This object MUST NEVER be forwarded to the
 * model (it is intentionally a separate builder from the provider input).
 */
export function buildExpectedIdentifiers(company: KrsCompany): ExpectedCompanyIdentifiers {
  return {
    krs: company.krs ?? null,
    nip: company.nip ?? null,
    regon: company.regon ?? null,
  };
}
