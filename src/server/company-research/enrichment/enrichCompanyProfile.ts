import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { logPipelineStage, stageErrorReasonCode } from "../logging/pipelineStageLog.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { cloneCompanyProfile } from "../profile-assembly/clone.ts";
import type { CompanyProfile } from "../../../contracts/companyResearch.ts";
import type { CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";
import type { KrsCompany } from "../types.ts";
import type { CompanyEnrichmentFacts, CompanyEnrichmentProvider } from "./types.ts";

/** True when the assembled profile carries none of the important business facts. */
function isBusinessDataEmpty(profile: CompanyProfile): boolean {
  return (
    !profile.business.description &&
    !profile.industry.description &&
    profile.business.productsServices.length === 0 &&
    profile.business.customerSegments.length === 0 &&
    profile.business.operatingMarkets.length === 0
  );
}

/**
 * Whether the assembled profile is a good candidate for the enrichment
 * fallback: it is legal-only (no confirmed website, no business research), or
 * it otherwise carries none of the important business fields (e.g. business
 * research ran but found nothing usable).
 */
export function needsEnrichment(assembly: CompanyProfileAssemblyResult): boolean {
  return assembly.status === "legal_only" || isBusinessDataEmpty(assembly.profile);
}

/**
 * Merges enrichment facts into a CLONE of the profile — fills ONLY fields the
 * profile is currently missing. KRS-owned legal identity/identifiers/location
 * are never touched; KRS remains authoritative for legal data.
 */
export function mergeEnrichmentFacts(
  profile: CompanyProfile,
  facts: CompanyEnrichmentFacts,
): CompanyProfile {
  const merged = cloneCompanyProfile(profile);

  if (!merged.business.description && facts.description.length > 0) {
    merged.business.description = facts.description;
  }
  if (!merged.industry.description && facts.industry.length > 0) {
    merged.industry.description = facts.industry;
  }
  if (merged.identity.foundedYear === undefined && facts.foundedYear !== null) {
    merged.identity.foundedYear = facts.foundedYear;
  }
  if (!merged.website.url && facts.website !== null) {
    // Defense-in-depth: `facts.website` is already normalized to a safe origin
    // by `parseCompanyEnrichmentOutput`, but `mergeEnrichmentFacts` is a
    // standalone, independently-tested function — never assume an upstream
    // guarantee holds and re-derive the safe origin here too.
    const safe = safeOriginFromUrl(facts.website);
    if (safe !== null) {
      merged.website = { url: safe.origin, domain: safe.hostname, verified: false };
    }
  }
  if (merged.business.productsServices.length === 0 && facts.productsServices.length > 0) {
    merged.business.productsServices = [...facts.productsServices];
  }
  if (merged.business.customerSegments.length === 0 && facts.customerSegments.length > 0) {
    merged.business.customerSegments = [...facts.customerSegments];
  }
  if (merged.business.operatingMarkets.length === 0 && facts.operatingMarkets.length > 0) {
    merged.business.operatingMarkets = [...facts.operatingMarkets];
  }

  return merged;
}

export interface EnrichCompanyProfileParams {
  assembly: CompanyProfileAssemblyResult;
  company: KrsCompany;
  /** A user-supplied identification hint, never authoritative. */
  foundedYearHint?: number;
}

export interface EnrichCompanyProfileDeps {
  provider: CompanyEnrichmentProvider;
}

/**
 * Best-effort business-fact enrichment for a legal-only / business-data-empty
 * profile. Reuses the existing OpenAI client (via the injected provider) for
 * ONE structured, privacy-guarded web-search call, then merges only the
 * missing fields into a clone of the assembled profile.
 *
 * On ANY failure — provider error/timeout, invalid output, or a personal-data
 * violation anywhere in the merged result — it gracefully falls back to the
 * original assembled profile. Enrichment is optional and must never fail the
 * dashboard request. Every outcome emits one safe, structured "enrichment"
 * stage log line (see `logPipelineStage`) so a production failure can be
 * diagnosed by its reason code instead of guessed at.
 */
export async function enrichCompanyProfile(
  params: EnrichCompanyProfileParams,
  deps: EnrichCompanyProfileDeps,
  options?: { signal?: AbortSignal },
): Promise<CompanyProfile> {
  const { assembly, company, foundedYearHint } = params;
  if (!needsEnrichment(assembly)) {
    logPipelineStage("enrichment", "skipped");
    return assembly.profile;
  }

  try {
    const facts = await deps.provider.enrich(
      {
        legalName: company.legalName,
        krs: company.krs,
        nip: company.nip,
        foundedYear: assembly.profile.identity.foundedYear ?? foundedYearHint,
        website: assembly.profile.website.url,
      },
      options,
    );
    const merged = mergeEnrichmentFacts(assembly.profile, facts);
    // Defense-in-depth: even a well-formed provider result must never leave a
    // trace of natural-person data anywhere in the merged profile.
    assertNoPersonalData(merged, "company");
    logPipelineStage("enrichment", "completed");
    return merged;
  } catch (error) {
    logPipelineStage("enrichment", "fallback", stageErrorReasonCode(error));
    return assembly.profile;
  }
}
