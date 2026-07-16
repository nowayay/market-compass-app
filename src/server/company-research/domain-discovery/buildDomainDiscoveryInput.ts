import type { KrsCompany } from "../types.ts";
import type { CompanyDomainDiscoveryInput } from "./types.ts";

/**
 * Builds the ALLOWLISTED, company-level discovery input from KRS-verified data.
 *
 * This is an explicit allowlist mapper (build up from nothing) — it never
 * forwards the public profile, the raw request, a street address, or any
 * natural-person data. Only company-as-entity fields are copied.
 */
export function buildDomainDiscoveryInput(company: KrsCompany): CompanyDomainDiscoveryInput {
  return {
    legalName: company.legalName,
    // KrsCompany has no verified aliases yet; keep the field for forward-compat.
    aliases: [],
    krs: company.krs,
    nip: company.nip ?? null,
    regon: company.regon ?? null,
    city: company.city ?? null,
    region: company.region ?? null,
    countryCode: company.countryCode,
    legalForm: company.legalForm ?? null,
  };
}
