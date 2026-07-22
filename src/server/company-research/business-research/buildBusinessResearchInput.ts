import type { KrsCompany } from "../types.ts";
import type { ConfirmedTarget } from "./invariants.ts";
import type { BusinessResearchInput } from "./types.ts";

/**
 * Builds the ALLOWLISTED business-research input from a FRESH object.
 *
 * It copies only search-targeting hints (legal name + coarse location) and the
 * confirmed target domain/origin. It explicitly does NOT include KRS/NIP/REGON,
 * PKD codes/labels, the raw KRS payload, a user query, previous model output,
 * discovery/confirmation identifiers, a prior/exact source URL, an arbitrary
 * company object or any natural-person data. Legal name and location are
 * search-targeting hints only.
 */
export function buildBusinessResearchInput(
  company: KrsCompany,
  target: ConfirmedTarget,
): BusinessResearchInput {
  return {
    legalName: company.legalName,
    city: company.city ?? null,
    region: company.region ?? null,
    countryCode: company.countryCode,
    targetDomain: target.targetDomain,
    targetOrigin: target.targetOrigin,
  };
}
