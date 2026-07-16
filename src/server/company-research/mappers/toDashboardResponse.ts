import type {
  CompanyProfile,
  CompanyResearchQuery,
  CompletedResponse,
  ExpansionResearchInputs,
  FactEvidence,
  NotFoundResponse,
  ResearchConflict,
  ResearchEvidence,
  ResearchQuality,
  ResearchSource,
  ResearchWarning,
  UnsupportedEntityReason,
  UnsupportedEntityTypeResponse,
} from "../../../contracts/companyResearch";
import type { KrsCompany, NormalizedQuery } from "../types";

/** The stable id of the single KRS provenance source in a completed response. */
const KRS_SOURCE_ID = "src_krs_1";

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
      // foundedYear is a user-provided identification hint, never a confirmed
      // company fact — it is deliberately NOT set on the profile. KRS
      // registrationDate is also not a founding date.
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
  return {
    id: KRS_SOURCE_ID,
    provider: "krs",
    type: "official_registry",
    authority: "primary",
    // The KRS API is not a public web page: it has no origin-only URL to expose.
    url: null,
    domain: null,
    retrievedAt: company.retrievedAt,
    publishedAt: null,
  };
}

/**
 * Builds fact-level evidence for the legal facts KRS actually provides. This is
 * the single authoritative source-to-fact attribution mechanism. Evidence is
 * created ONLY for facts that are present — absent optional KRS values never
 * produce a fabricated evidence entry.
 */
export function buildKrsFactEvidence(
  company: KrsCompany,
  krsSourceId: string,
  verifiedAt: string,
): FactEvidence[] {
  const facts: FactEvidence[] = [];
  const add = (path: string, present: boolean): void => {
    if (!present) return;
    facts.push({
      id: `fev_${path.replace(/\./g, "_")}`,
      target: { path, itemId: null },
      sourceIds: [krsSourceId],
      support: "direct",
      derivation: "registry",
      confidence: 1,
      verifiedAt,
    });
  };

  add("company.identity.legalName", company.legalName.length > 0);
  add("company.identity.identifiers.krs", company.krs.length > 0);
  add("company.identity.identifiers.nip", Boolean(company.nip));
  add("company.identity.identifiers.regon", Boolean(company.regon));
  add("company.identity.legalForm", Boolean(company.legalForm));
  add("company.identity.registrationDate", Boolean(company.registrationDate));
  add("company.location.city", Boolean(company.city));
  add("company.location.region", Boolean(company.region));
  add("company.location.countryCode", company.countryCode.length > 0);

  return facts;
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
  const conflicts: ResearchConflict[] = [];
  const warnings: ResearchWarning[] = [];

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
        // Code-based structures only — never free text that could carry PII.
        conflicts.push({
          code: "legal_name_mismatch",
          targetPath: "company.identity.legalName",
          sourceIds: [KRS_SOURCE_ID],
          resolution: "krs_preferred",
        });
        warnings.push({
          code: "query_name_mismatch",
          targetPath: "company.identity.legalName",
        });
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
  /** Extra (non-KRS) provenance sources, e.g. web discovery in the name flow. */
  extraSources?: ResearchSource[];
}): CompletedResponse {
  // Website discovery/verification is a separate later stage — never set from a
  // single web-search result here.
  const krsSource = buildKrsSource(args.company);
  const evidence: ResearchEvidence = {
    // Evidence is attributed only to the KRS source. Web discovery sources are
    // NOT claimed to support any legal fact (see mappers/toIdentificationResponse).
    facts: buildKrsFactEvidence(args.company, krsSource.id, args.company.retrievedAt),
  };
  return {
    status: "completed",
    requestId: args.requestId,
    query: toResponseQuery(args.query),
    company: buildCompanyProfile(args.company, args.query),
    expansionInputs: buildExpansionInputs(args.company),
    sources: [krsSource, ...(args.extraSources ?? [])],
    evidence,
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
