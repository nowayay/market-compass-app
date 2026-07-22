/**
 * Strict runtime-shape validation for the RAW `CompanyProfileAssemblyResult` an
 * `assembleCompanyProfile` dependency returns, BEFORE it is trusted, privacy-
 * checked or cloned. An injected dependency (production closure or test stub) is
 * untrusted input: this rejects an unexpected/hostile field (e.g. a smuggled
 * `contactPerson`, `owner`, exact page URL) instead of a permissive clone
 * silently discarding it.
 *
 * `CompanyProfile` is a PUBLIC contract type (`contracts/companyResearch.ts`),
 * already validated by a strict public zod schema for the HTTP response path
 * (`contracts/companyResearchSchema.ts`). That file is shared with the browser
 * bundle and is intentionally left untouched — this module does NOT export from
 * it or add to it; it re-validates the SAME shape purely internally, owned here
 * because profile assembly is the only internal stage that produces a
 * `CompanyProfile`.
 *
 * All object/array reads go through `assertExactOwnShape`/`assertDenseArray`
 * (own-property-only, sparse-array-rejecting) — see `shared/runtimeShape.ts`.
 * Every returned value is a FRESH object/array, never the original input.
 */
import {
  assertDenseArray,
  assertExactOwnShape,
  arraysEqual,
  isOriginOnlyUrl,
  originHostname,
  requireNonEmptyString,
  requireOptionalString,
} from "../shared/runtimeShape.ts";
import {
  assertValidFactEvidenceArrayShape,
  assertValidResearchSourceArrayShape,
} from "../shared/researchRecordShape.ts";
import { ProfileAssemblyInvariantError } from "./errors.ts";
import { orderAssemblyReasons } from "./reasonCodes.ts";
import type { CompanyProfile } from "../../../contracts/companyResearch.ts";
import type { CompanyProfileAssemblyReasonCode } from "./reasonCodes.ts";
import type { CompanyProfileAssemblyResult, CompanyProfileAssemblyStatus } from "./types.ts";

const fail = (message: string): never => {
  throw new ProfileAssemblyInvariantError(message);
};

const STATUSES: ReadonlySet<CompanyProfileAssemblyStatus> = new Set(["complete", "partial", "legal_only"]);
const RESULT_KEYS = ["status", "profile", "sources", "evidence", "reasons"];
const PROFILE_KEYS = ["identity", "location", "website", "industry", "business"];
const IDENTITY_KEYS = [
  "legalName",
  "displayName",
  "aliases",
  "countryCode",
  "identifiers",
  "legalForm",
  "legalStatus",
  "registrationDate",
  "foundedYear",
];
const IDENTIFIERS_KEYS = ["krs", "nip", "regon"];
const LOCATION_KEYS = ["city", "region", "countryCode"];
const WEBSITE_KEYS = ["url", "domain", "verified"];
const INDUSTRY_KEYS = ["primaryCode", "secondaryCodes", "labels", "description"];
const BUSINESS_KEYS = ["description", "productsServices", "customerSegments", "operatingMarkets"];

function assertStringArray(value: unknown, context: string): string[] {
  return assertDenseArray(
    value,
    (item) => {
      if (typeof item !== "string" || item.length === 0) fail(`${context} is not a string array`);
      return item as string;
    },
    fail,
    context,
  );
}

function assertValidIdentityShape(value: unknown): CompanyProfile["identity"] {
  const identity = assertExactOwnShape(value, IDENTITY_KEYS, fail, "profile identity");

  const legalName = requireNonEmptyString(identity.get("legalName"), fail, "profile identity legalName is not a non-empty string");
  const displayName = requireOptionalString(identity.get("displayName"), fail, "profile identity displayName has an unsupported type");
  const aliases = assertStringArray(identity.get("aliases"), "profile identity aliases");
  const countryCode = requireNonEmptyString(identity.get("countryCode"), fail, "profile identity countryCode is not a non-empty string");
  const legalForm = requireOptionalString(identity.get("legalForm"), fail, "profile identity legalForm has an unsupported type");
  const legalStatus = requireOptionalString(identity.get("legalStatus"), fail, "profile identity legalStatus has an unsupported type");
  const registrationDate = requireOptionalString(identity.get("registrationDate"), fail, "profile identity registrationDate has an unsupported type");
  const foundedYearRaw = identity.get("foundedYear");
  if (foundedYearRaw !== undefined && typeof foundedYearRaw !== "number") {
    fail("profile identity foundedYear has an unsupported type");
  }
  const foundedYear = foundedYearRaw as number | undefined;

  const identifiersMap = assertExactOwnShape(identity.get("identifiers"), IDENTIFIERS_KEYS, fail, "profile identity identifiers");
  const krs = requireNonEmptyString(identifiersMap.get("krs"), fail, "profile identity identifiers.krs is not a non-empty string");
  const nip = requireOptionalString(identifiersMap.get("nip"), fail, "profile identity identifiers.nip has an unsupported type");
  const regon = requireOptionalString(identifiersMap.get("regon"), fail, "profile identity identifiers.regon has an unsupported type");

  return {
    legalName,
    displayName,
    aliases,
    countryCode,
    identifiers: { krs, nip, regon },
    legalForm,
    legalStatus,
    registrationDate,
    foundedYear,
  };
}

function assertValidLocationShape(value: unknown): CompanyProfile["location"] {
  const location = assertExactOwnShape(value, LOCATION_KEYS, fail, "profile location");
  const city = requireOptionalString(location.get("city"), fail, "profile location city has an unsupported type");
  const region = requireOptionalString(location.get("region"), fail, "profile location region has an unsupported type");
  const countryCode = requireNonEmptyString(location.get("countryCode"), fail, "profile location countryCode is not a non-empty string");
  return { city, region, countryCode };
}

function assertValidWebsiteShape(value: unknown): CompanyProfile["website"] {
  const website = assertExactOwnShape(value, WEBSITE_KEYS, fail, "profile website");
  const urlRaw = website.get("url");
  const domainRaw = website.get("domain");
  if (urlRaw !== undefined) {
    if (!isOriginOnlyUrl(urlRaw)) fail("profile website url is not origin-only");
    if (domainRaw !== originHostname(urlRaw as string)) fail("profile website domain does not match its url hostname");
  } else if (domainRaw !== undefined) {
    fail("profile website domain is present without a url");
  }
  const verifiedRaw = website.get("verified");
  if (typeof verifiedRaw !== "boolean") fail("profile website verified is not a boolean");
  const verified = verifiedRaw as boolean;
  if (verified && urlRaw === undefined) fail("profile website is verified without a url");
  return { url: urlRaw as string | undefined, domain: domainRaw as string | undefined, verified };
}

function assertValidIndustryShape(value: unknown): CompanyProfile["industry"] {
  const industry = assertExactOwnShape(value, INDUSTRY_KEYS, fail, "profile industry");
  const primaryCode = requireOptionalString(industry.get("primaryCode"), fail, "profile industry primaryCode has an unsupported type");
  const secondaryCodes = assertStringArray(industry.get("secondaryCodes"), "profile industry secondaryCodes");
  const labels = assertStringArray(industry.get("labels"), "profile industry labels");
  const description = requireOptionalString(industry.get("description"), fail, "profile industry description has an unsupported type");
  return { primaryCode, secondaryCodes, labels, description };
}

function assertValidBusinessShape(value: unknown): CompanyProfile["business"] {
  const business = assertExactOwnShape(value, BUSINESS_KEYS, fail, "profile business");
  const description = requireOptionalString(business.get("description"), fail, "profile business description has an unsupported type");
  const productsServices = assertStringArray(business.get("productsServices"), "profile business productsServices");
  const customerSegments = assertStringArray(business.get("customerSegments"), "profile business customerSegments");
  const operatingMarkets = assertStringArray(business.get("operatingMarkets"), "profile business operatingMarkets");
  return { description, productsServices, customerSegments, operatingMarkets };
}

/** Validates the COMPLETE raw runtime shape of one `CompanyProfile`. */
export function assertValidCompanyProfileShape(value: unknown): CompanyProfile {
  const profile = assertExactOwnShape(value, PROFILE_KEYS, fail, "profile");
  return {
    identity: assertValidIdentityShape(profile.get("identity")),
    location: assertValidLocationShape(profile.get("location")),
    website: assertValidWebsiteShape(profile.get("website")),
    industry: assertValidIndustryShape(profile.get("industry")),
    business: assertValidBusinessShape(profile.get("business")),
  };
}

/**
 * Validates the COMPLETE raw runtime shape of a `CompanyProfileAssemblyResult`
 * and returns a FRESH result (never the original input). Throws
 * `ProfileAssemblyInvariantError` on the first violation.
 */
export function assertValidProfileAssemblyResultShape(value: unknown): CompanyProfileAssemblyResult {
  const r = assertExactOwnShape(value, RESULT_KEYS, fail, "profile assembly result");

  const statusRaw = r.get("status");
  if (typeof statusRaw !== "string" || !STATUSES.has(statusRaw as CompanyProfileAssemblyStatus)) {
    fail("profile assembly status is invalid");
  }
  const status = statusRaw as CompanyProfileAssemblyStatus;

  const profile = assertValidCompanyProfileShape(r.get("profile"));
  const sources = assertValidResearchSourceArrayShape(r.get("sources"), fail);
  const evidence = assertValidFactEvidenceArrayShape(r.get("evidence"), fail);

  const reasons = assertDenseArray(
    r.get("reasons"),
    (item) => item as CompanyProfileAssemblyReasonCode,
    fail,
    "profile assembly reasons",
  );
  if (!arraysEqual(orderAssemblyReasons(reasons), reasons)) {
    fail("profile assembly reasons is not a canonical closed-enum set");
  }

  return { status, profile, sources, evidence, reasons };
}
