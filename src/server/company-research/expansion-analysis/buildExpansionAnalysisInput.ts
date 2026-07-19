import type { CompanyProfile } from "../../../contracts/companyResearch.ts";
import type { ExpansionAnalysisInput } from "./types.ts";

/**
 * Builds the privacy-safe, allowlisted input sent to the expansion-analysis
 * model. Only company-as-entity facts already present on the assembled
 * profile are included — no identifiers (KRS/NIP/REGON), no website URL, no
 * address, no natural-person data.
 */
export function buildExpansionAnalysisInput(profile: CompanyProfile): ExpansionAnalysisInput {
  return {
    legalName: profile.identity.legalName,
    countryCode: profile.location.countryCode,
    city: profile.location.city,
    industry: profile.industry.description ?? profile.industry.labels[0],
    description: profile.business.description,
    productsServices: profile.business.productsServices,
    customerSegments: profile.business.customerSegments,
    operatingMarkets: profile.business.operatingMarkets,
  };
}
