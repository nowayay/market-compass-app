import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { logPipelineStage, stageErrorReasonCode } from "../logging/pipelineStageLog.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { cloneCompanyProfile } from "../profile-assembly/clone.ts";
import { buildWebsiteEvidence } from "../profile-assembly/evidence.ts";
import { buildWebsiteSource } from "../profile-assembly/sources.ts";
import type { CompanyProfile, FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";
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
  /** Clock for the provenance `retrievedAt`. Defaults to the wall clock. */
  now?: () => Date;
}

/**
 * The enriched profile plus any origin-only provenance the enrichment actually
 * produced. `sources`/`evidence` are non-empty ONLY when the enrichment
 * discovered and merged the company's official website origin — every source is
 * backed by a matching `FactEvidence` entry, so the dashboard can attribute it
 * to a real fact and never invents a source from a bare `website` field. Both
 * are empty when enrichment is skipped, fails, or adds no website origin.
 */
export interface EnrichCompanyProfileResult {
  profile: CompanyProfile;
  sources: ResearchSource[];
  evidence: FactEvidence[];
}

/**
 * Builds the evidence-backed, origin-only provenance for the website the
 * enrichment just added — and NOTHING else. It returns a source only when this
 * enrichment call itself introduced a new website origin (the profile had none
 * before and now has a valid origin); an already-present website, or a merge
 * that added no website, yields no source. This is what makes the returned
 * source genuinely "from evidence" rather than synthesized from a URL field.
 */
function buildEnrichmentProvenance(
  before: CompanyProfile,
  after: CompanyProfile,
  now: () => Date,
): { sources: ResearchSource[]; evidence: FactEvidence[] } {
  const addedWebsite = !before.website.url && Boolean(after.website.url);
  if (!addedWebsite) return { sources: [], evidence: [] };

  const origin = after.website.url as string;
  const safe = safeOriginFromUrl(origin);
  // Defense-in-depth: only an already-origin-only value becomes a source.
  if (safe === null || safe.origin !== origin) return { sources: [], evidence: [] };

  const retrievedAt = now().toISOString();
  const source = buildWebsiteSource(origin, retrievedAt);
  const evidence = buildWebsiteEvidence(source.id, retrievedAt);
  return { sources: [source], evidence: [evidence] };
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
): Promise<EnrichCompanyProfileResult> {
  const { assembly, company, foundedYearHint } = params;
  const now = deps.now ?? (() => new Date());
  if (!needsEnrichment(assembly)) {
    logPipelineStage("enrichment", "skipped");
    return { profile: assembly.profile, sources: [], evidence: [] };
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
    const { sources, evidence } = buildEnrichmentProvenance(assembly.profile, merged, now);
    return { profile: merged, sources, evidence };
  } catch (error) {
    logPipelineStage("enrichment", "fallback", stageErrorReasonCode(error));
    return { profile: assembly.profile, sources: [], evidence: [] };
  }
}
