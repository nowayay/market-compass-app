/**
 * Explicit deep-clone helper for the assembled `CompanyProfile`.
 *
 * The assembly result must be fully DETACHED from every input (the KRS company,
 * the domain-resolution result and the business-research result): a later consumer
 * mutating one field must never silently change an input array/object (which could
 * invalidate an already-checked invariant, or alias a KRS-owned array). This copies
 * every mutable nested array/object by value — no `JSON.parse(JSON.stringify(...))`.
 *
 * Source and evidence cloning live with their merge helpers (`cloneSource` /
 * `cloneEvidence`); this module owns only the profile. Pure and dependency-free.
 */
import type { CompanyProfile } from "../../../contracts/companyResearch.ts";

/** Returns a fully detached copy of a company profile (all nested arrays/objects new). */
export function cloneCompanyProfile(profile: CompanyProfile): CompanyProfile {
  return {
    identity: {
      legalName: profile.identity.legalName,
      displayName: profile.identity.displayName,
      aliases: [...profile.identity.aliases],
      countryCode: profile.identity.countryCode,
      identifiers: {
        krs: profile.identity.identifiers.krs,
        nip: profile.identity.identifiers.nip,
        regon: profile.identity.identifiers.regon,
      },
      legalForm: profile.identity.legalForm,
      legalStatus: profile.identity.legalStatus,
      registrationDate: profile.identity.registrationDate,
      foundedYear: profile.identity.foundedYear,
    },
    location: {
      city: profile.location.city,
      region: profile.location.region,
      countryCode: profile.location.countryCode,
    },
    website: {
      url: profile.website.url,
      domain: profile.website.domain,
      verified: profile.website.verified,
    },
    industry: {
      primaryCode: profile.industry.primaryCode,
      secondaryCodes: [...profile.industry.secondaryCodes],
      labels: [...profile.industry.labels],
      description: profile.industry.description,
    },
    business: {
      description: profile.business.description,
      productsServices: [...profile.business.productsServices],
      customerSegments: [...profile.business.customerSegments],
      operatingMarkets: [...profile.business.operatingMarkets],
    },
  };
}
