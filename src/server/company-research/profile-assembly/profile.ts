/**
 * Deterministic company-profile construction for the assembly stage.
 *
 * KRS stays authoritative: the legal base (identity, identifiers, location and
 * industry codes/labels) comes straight from the existing KRS profile mapper and
 * is never overwritten by web research. The confirmed website and the four allowed
 * business facts (`industry.description`, `business.productsServices`,
 * `business.customerSegments`, `business.operatingMarkets`) are overlaid on top,
 * and the deterministic description is composed from the accepted facts.
 */
import { buildCompanyProfile } from "../mappers/toDashboardResponse.ts";
import { canonicalKey } from "../business-research/normalizeBusinessFacts.ts";
import { buildCompanyDescription } from "./description.ts";
import type { DescriptionBuild } from "./description.ts";
import type { ConfirmedTarget } from "./invariants.ts";
import type { CompanyProfile } from "../../../contracts/companyResearch.ts";
import type { NormalizedQuery } from "../types.ts";
import type { KrsCompany } from "../types.ts";
import type { StructuredBusinessFacts } from "../business-research/types.ts";

/** No accepted business facts (used for the description when none were accepted). */
const EMPTY_FACTS: StructuredBusinessFacts = {
  industryDescription: null,
  productsServices: [],
  customerSegments: [],
  operatingMarkets: [],
};

/**
 * Deterministically orders a business list by its canonical normalized key, with
 * the accepted display spelling as a stable tie-breaker. Diacritics are preserved
 * (canonicalKey never strips them) and distinct facts are never merged; the input
 * array is copied, never mutated.
 */
function canonicalizeList(values: readonly string[]): string[] {
  return [...values].sort((a, b) => {
    const ka = canonicalKey(a);
    const kb = canonicalKey(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * Canonically orders the three accepted business list facts so the profile arrays,
 * the deterministic description, the displayed examples and the description
 * evidence all derive from one stable ordering. `industryDescription` is scalar and
 * unchanged. Upstream arrays are never mutated.
 */
export function canonicalizeBusinessFacts(facts: StructuredBusinessFacts): StructuredBusinessFacts {
  return {
    industryDescription: facts.industryDescription,
    productsServices: canonicalizeList(facts.productsServices),
    customerSegments: canonicalizeList(facts.customerSegments),
    operatingMarkets: canonicalizeList(facts.operatingMarkets),
  };
}

export interface AssembledProfileParts {
  profile: CompanyProfile;
  description: DescriptionBuild;
}

/**
 * Builds the assembled profile. `confirmedTarget` is non-null only for a validated
 * confirmed domain; `acceptedFacts` is non-null only for a completed/partial
 * business result. KRS-derived values are produced by the existing mapper and left
 * untouched — website and the four business facts are the only overlays.
 */
export function buildAssembledProfile(args: {
  company: KrsCompany;
  confirmedTarget: ConfirmedTarget | null;
  acceptedFacts: StructuredBusinessFacts | null;
}): AssembledProfileParts {
  // The KRS mapper only ever reads `query.countryCode` as a fallback; we derive a
  // minimal query from the KRS company itself so no raw user input enters here.
  const query: NormalizedQuery = {
    name: args.company.legalName,
    countryCode: args.company.countryCode,
  };
  const profile = buildCompanyProfile(args.company, query);

  // Website: only a validated confirmed target marks the website verified; every
  // other resolution status keeps the KRS default (`verified: false`, no url/domain).
  if (args.confirmedTarget !== null) {
    profile.website = {
      url: args.confirmedTarget.targetOrigin, // origin-only (validated upstream)
      domain: args.confirmedTarget.targetDomain,
      verified: true,
    };
  }

  // Business facts: populate ONLY the four allowed fields; never legal identifiers,
  // legal name, address, or industry codes/labels.
  if (args.acceptedFacts !== null) {
    if (args.acceptedFacts.industryDescription !== null) {
      profile.industry.description = args.acceptedFacts.industryDescription;
    }
    profile.business.productsServices = [...args.acceptedFacts.productsServices];
    profile.business.customerSegments = [...args.acceptedFacts.customerSegments];
    profile.business.operatingMarkets = [...args.acceptedFacts.operatingMarkets];
  }

  const description = buildCompanyDescription(args.company.legalName, args.acceptedFacts ?? EMPTY_FACTS);
  if (description.text !== null) {
    profile.business.description = description.text;
  }

  return { profile, description };
}
