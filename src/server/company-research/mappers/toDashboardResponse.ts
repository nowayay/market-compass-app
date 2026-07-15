import type {
  CompanyProfile,
  CompanyResearchQuery,
  CompletedResponse,
  ExpansionResearchInputs,
  NotFoundResponse,
  ResearchQuality,
  ResearchSource,
  UnsupportedEntityReason,
  UnsupportedEntityTypeResponse,
} from "../../../contracts/companyResearch";
import type { KrsCompany, NormalizedQuery } from "../types";

/** Legal-form and connective stopwords ignored when comparing company names. */
const NAME_STOPWORDS = new Set([
  "sp",
  "z",
  "o",
  "oo",
  "spolka",
  "spółka",
  "akcyjna",
  "sa",
  "s",
  "a",
  "komandytowa",
  "jawna",
  "z.o.o",
  "zoo",
  "i",
  "the",
]);

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^0-9a-ząćęłńóśźż]+/i)
      .map((t) => t.replace(/\./g, ""))
      .filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t)),
  );
}

/** The query as echoed back to clients (without internal-only fields). */
export function toResponseQuery(query: NormalizedQuery): CompanyResearchQuery {
  return {
    name: query.name,
    countryCode: query.countryCode,
    foundedYear: query.foundedYear,
    krs: query.krs,
  };
}

/** Builds the allowlisted company profile from sanitized KRS data. */
export function buildCompanyProfile(
  company: KrsCompany,
  query: NormalizedQuery,
): CompanyProfile {
  return {
    identity: {
      legalName: company.legalName,
      aliases: [],
      countryCode: company.countryCode || query.countryCode,
      identifiers: {
        krs: company.krs,
        nip: company.nip,
        regon: company.regon,
      },
      legalForm: company.legalForm,
      registrationDate: company.registrationDate,
      foundedYear: query.foundedYear,
    },
    location: {
      city: company.city,
      region: company.region,
      countryCode: company.countryCode || query.countryCode,
    },
    website: {
      // Website discovery/verification is a later (web research) stage.
      verified: false,
    },
    industry: {
      primaryCode: company.pkdPrimaryCode,
      secondaryCodes: company.pkdSecondaryCodes,
      labels: company.pkdLabels,
    },
    business: {
      productsServices: [],
      customerSegments: [],
      operatingMarkets: [],
    },
  };
}

/** Builds the KRS provenance source (metadata only — no response content). */
export function buildKrsSource(company: KrsCompany): ResearchSource {
  const supports = ["company.identity.legalName", "company.identity.identifiers.krs"];
  if (company.nip) supports.push("company.identity.identifiers.nip");
  if (company.regon) supports.push("company.identity.identifiers.regon");
  if (company.legalForm) supports.push("company.identity.legalForm");
  if (company.registrationDate) supports.push("company.identity.registrationDate");
  if (company.city) supports.push("company.location.city");
  if (company.region) supports.push("company.location.region");
  if (company.pkdPrimaryCode) supports.push("company.industry.primaryCode");

  return {
    id: "src_krs_1",
    provider: "krs",
    type: "official_registry",
    title: "Krajowy Rejestr Sądowy (odpis aktualny)",
    retrievedAt: company.retrievedAt,
    authority: "primary",
    supports,
  };
}

/** Expansion inputs are mostly empty in stage 1; we flag what's still missing. */
export function buildExpansionInputs(company: KrsCompany): ExpansionResearchInputs {
  const missingCriticalInputs = [
    "business.description",
    "business.productsServices",
    "business.customerSegments",
    "business.operatingMarkets",
    "website.url",
  ];
  return {
    currentMarkets: [],
    productCategories: [],
    customerType: "unknown",
    salesChannels: [],
    internationalExperience: [],
    digitalPresence: [],
    scaleSignals: [],
    regulatoryConstraints: [],
    operationalConstraints: [],
    missingCriticalInputs: company.pkdPrimaryCode
      ? missingCriticalInputs
      : ["company.industry.primaryCode", ...missingCriticalInputs],
  };
}

/** Computes identity confidence and completeness for a KRS-matched company. */
export function buildResearchQuality(
  company: KrsCompany,
  query: NormalizedQuery,
): ResearchQuality {
  const conflicts: string[] = [];
  const warnings: string[] = [];

  // KRS is an exact-identifier match, so confidence is high unless the caller's
  // provided name clearly conflicts with the registered name.
  let level: ResearchQuality["identityConfidence"]["level"] = "high";
  let score = 0.95;

  if (query.name.length > 0 && company.legalName.length > 0) {
    const queryTokens = nameTokens(query.name);
    const legalTokens = nameTokens(company.legalName);
    if (queryTokens.size > 0 && legalTokens.size > 0) {
      const overlap = [...queryTokens].some((t) => legalTokens.has(t));
      if (!overlap) {
        level = "medium";
        score = 0.6;
        conflicts.push("company.identity.legalName");
        warnings.push("Podana nazwa nie zgadza się z nazwą rejestrową podmiotu.");
      }
    }
  }

  const expected: Array<[string, boolean]> = [
    ["company.identity.legalName", company.legalName.length > 0],
    ["company.identity.legalForm", Boolean(company.legalForm)],
    ["company.identity.identifiers.nip", Boolean(company.nip)],
    ["company.identity.identifiers.regon", Boolean(company.regon)],
    ["company.identity.registrationDate", Boolean(company.registrationDate)],
    ["company.location.city", Boolean(company.city)],
    ["company.location.region", Boolean(company.region)],
    ["company.industry.primaryCode", Boolean(company.pkdPrimaryCode)],
    ["company.website.url", false],
    ["company.business.description", false],
  ];
  const present = expected.filter(([, ok]) => ok).length;
  const missingFields = expected.filter(([, ok]) => !ok).map(([path]) => path);
  const completenessScore = Number((present / expected.length).toFixed(2));

  return {
    identityConfidence: { level, score },
    completenessScore,
    missingFields,
    conflicts,
    warnings,
    lastVerifiedAt: company.retrievedAt,
  };
}

export function buildCompletedResponse(args: {
  requestId: string;
  query: NormalizedQuery;
  company: KrsCompany;
  version: string;
  researchedAt: string;
}): CompletedResponse {
  return {
    status: "completed",
    requestId: args.requestId,
    query: toResponseQuery(args.query),
    company: buildCompanyProfile(args.company, args.query),
    expansionInputs: buildExpansionInputs(args.company),
    sources: [buildKrsSource(args.company)],
    quality: buildResearchQuality(args.company, args.query),
    meta: { researchedAt: args.researchedAt, version: args.version },
  };
}

export function buildNotFoundResponse(args: {
  requestId: string;
  query: NormalizedQuery;
}): NotFoundResponse {
  return {
    status: "not_found",
    requestId: args.requestId,
    query: toResponseQuery(args.query),
    message: "Nie znaleziono pasującego podmiotu.",
  };
}

export function buildUnsupportedResponse(args: {
  requestId: string;
  query: NormalizedQuery;
  reason: UnsupportedEntityReason;
}): UnsupportedEntityTypeResponse {
  return {
    status: "unsupported_entity_type",
    requestId: args.requestId,
    query: toResponseQuery(args.query),
    reason: args.reason,
    message: "MarketCompass nie obsługuje działalności osób fizycznych.",
  };
}
