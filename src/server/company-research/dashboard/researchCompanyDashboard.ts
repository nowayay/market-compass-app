import type {
  CompanyDashboardResponse,
  DashboardCompanyInfo,
} from "../../../contracts/companyDashboard.ts";
import { buildSkippedResult } from "../business-research/buildBusinessResult.ts";
import { deriveDashboardSources } from "./dashboardSources.ts";
import { enrichCompanyProfile } from "../enrichment/enrichCompanyProfile.ts";
import type { CompanyEnrichmentProvider } from "../enrichment/types.ts";
import { CompanyResearchInternalError } from "../errors.ts";
import { buildExpansionAnalysisInput } from "../expansion-analysis/buildExpansionAnalysisInput.ts";
import { logPipelineStage, stageErrorReasonCode } from "../logging/pipelineStageLog.ts";
import type { ExpansionAnalysisProvider } from "../expansion-analysis/types.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { guardAndValidateDashboardResponse } from "./dashboardResponseGuard.ts";
import { researchCompany } from "../researchCompany.ts";
import type { CompanyResearchDeps, ResearchContext } from "../researchCompany.ts";
import type { CompanyResearchRequest } from "../schema.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { CompanyWebResearchDeps } from "../web-research/types.ts";
import { orchestrateCompanyWebResearch } from "../web-research/orchestrateCompanyWebResearch.ts";
import type { CompanyProfile } from "../../../contracts/companyResearch.ts";

/** All injected dependencies for the Dashboard composition. */
export interface CompanyDashboardDeps extends CompanyResearchDeps {
  webResearchDeps: CompanyWebResearchDeps;
  expansionAnalysisProvider: ExpansionAnalysisProvider;
  enrichmentProvider: CompanyEnrichmentProvider;
}

/**
 * Stable codes of the sub-stage errors that mean "this optional paid
 * enrichment is currently unavailable" (disabled by configuration,
 * rate-limited, busy, timed out, or a provider/validation failure) — as
 * opposed to a genuine bug (an invariant violation) or a privacy violation,
 * which must never be silently swallowed. See `domain-discovery/errors.ts`,
 * `domain-confirmation/errors.ts` and `business-research/errors.ts`.
 */
const WEB_RESEARCH_UNAVAILABLE_CODES = new Set<string>([
  "COMPANY_DOMAIN_DISCOVERY_DISABLED",
  "COMPANY_DOMAIN_DISCOVERY_RATE_LIMITED",
  "COMPANY_DOMAIN_DISCOVERY_BUSY",
  "COMPANY_DOMAIN_DISCOVERY_TIMEOUT",
  "COMPANY_DOMAIN_DISCOVERY_ERROR",
  "INVALID_DOMAIN_DISCOVERY_RESPONSE",
  "COMPANY_DOMAIN_CONFIRMATION_DISABLED",
  "COMPANY_DOMAIN_CONFIRMATION_RATE_LIMITED",
  "COMPANY_DOMAIN_CONFIRMATION_BUSY",
  "COMPANY_DOMAIN_CONFIRMATION_TIMEOUT",
  "COMPANY_DOMAIN_CONFIRMATION_ERROR",
  "INVALID_DOMAIN_CONFIRMATION_RESPONSE",
  "COMPANY_BUSINESS_RESEARCH_DISABLED",
  "COMPANY_BUSINESS_RESEARCH_RATE_LIMITED",
  "COMPANY_BUSINESS_RESEARCH_BUSY",
  "COMPANY_BUSINESS_RESEARCH_TIMEOUT",
  "COMPANY_BUSINESS_RESEARCH_ERROR",
  "INVALID_BUSINESS_RESEARCH_RESPONSE",
]);

function isWebResearchUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code: unknown }).code;
  return typeof code === "string" && WEB_RESEARCH_UNAVAILABLE_CODES.has(code);
}

/**
 * Maps the assembled, web-enriched (and possibly fallback-enriched)
 * `CompanyProfile` onto the flat dashboard company-info shape. `foundedYear`
 * prefers a real fact discovered on the profile (KRS never carries one; the
 * enrichment fallback may) and otherwise falls back to the user-supplied
 * identification hint echoed from the query — never a verified registry fact
 * (see `mappers/toDashboardResponse.buildCompanyProfile`).
 */
function toDashboardCompanyInfo(profile: CompanyProfile, foundedYearHint: number | undefined): DashboardCompanyInfo {
  return {
    legalName: profile.identity.legalName,
    krs: profile.identity.identifiers.krs,
    nip: profile.identity.identifiers.nip,
    regon: profile.identity.identifiers.regon,
    foundedYear: profile.identity.foundedYear ?? foundedYearHint,
    website: profile.website.url,
    industry: profile.industry.description ?? profile.industry.labels[0],
    description: profile.business.description,
    productsServices: profile.business.productsServices,
    customerSegments: profile.business.customerSegments,
    operatingMarkets: profile.business.operatingMarkets,
  };
}

/**
 * Runs the internal web-research orchestration, but degrades gracefully to a
 * KRS-only profile when an optional paid sub-stage is currently unavailable
 * (disabled by configuration / rate-limited / busy / provider trouble) rather
 * than failing the whole dashboard request — this is a demo-ready MVP: the
 * legal profile + AI expansion analysis must still render even when the
 * website/business-research paid flows are turned off. A genuine invariant or
 * privacy violation is NEVER swallowed here — it always propagates.
 */
async function assembleWebEnrichedProfile(
  request: Parameters<typeof orchestrateCompanyWebResearch>[0],
  deps: CompanyWebResearchDeps,
) {
  try {
    const result = await orchestrateCompanyWebResearch(request, deps);
    logPipelineStage("web-research", "completed");
    return result;
  } catch (error) {
    if (!isWebResearchUnavailable(error)) {
      logPipelineStage("web-research", "error", stageErrorReasonCode(error));
      throw error;
    }
    logPipelineStage("web-research", "fallback", stageErrorReasonCode(error));
    const domainResolution: CompanyDomainResolutionResult = {
      status: "not_found",
      confirmedOrigin: null,
      selectedCandidate: null,
      evaluatedCandidates: [],
      confirmation: null,
      reasons: ["NO_DISCOVERY_CANDIDATES"],
      sourceOrigins: [],
    };
    const businessResearch = buildSkippedResult();
    const profileAssembly = assembleCompanyProfile(
      { company: request.company, domainResolution, businessResearch },
      { now: deps.now },
    );
    return { domainResolution, businessResearch, profileAssembly };
  }
}

/**
 * The Dashboard-oriented Company Research flow.
 *
 * Reuses `researchCompany()` UNCHANGED for identification (exact KRS,
 * candidate confirmation, name search) — this function never duplicates that
 * logic. Only when identification resolves to a single company does it go
 * further: it re-fetches the sanitized `KrsCompany` (the same
 * `CompanyDataProvider.fetchByKrs` interface `researchCompany` itself uses),
 * runs the internal `orchestrateCompanyWebResearch` pipeline to enrich the
 * profile (confirmed website + structured business facts, when available),
 * and makes ONE structured AI call to produce the expansion analysis (SWOT +
 * a 15-country ranking).
 *
 * Preserves the same three non-error outcomes as `researchCompany` — a
 * `needs_confirmation`/`not_found` result is passed straight through
 * (unsupported-entity is folded into `not_found`, since MarketCompass never
 * processes natural-person businesses either way) — plus the existing typed
 * error hierarchy for a safe error response.
 */
export async function researchCompanyDashboard(
  request: CompanyResearchRequest,
  deps: CompanyDashboardDeps,
  ctx: ResearchContext,
): Promise<CompanyDashboardResponse> {
  const response = await researchCompany(request, deps, ctx);

  if (response.status === "needs_confirmation") {
    return guardAndValidateDashboardResponse({
      status: "needs_confirmation",
      requestId: response.requestId,
      query: response.query,
      candidates: response.candidates,
    });
  }
  if (response.status === "not_found") {
    return guardAndValidateDashboardResponse({
      status: "not_found",
      requestId: response.requestId,
      query: response.query,
      message: response.message,
    });
  }
  if (response.status === "unsupported_entity_type") {
    return guardAndValidateDashboardResponse({
      status: "not_found",
      requestId: response.requestId,
      query: response.query,
      message: response.message,
    });
  }

  // response.status === "completed" — the identified company's own (sanitized,
  // 10-digit) KRS number is always present on a completed profile.
  const krs = response.company.identity.identifiers.krs;
  if (krs === undefined) {
    throw new CompanyResearchInternalError("Completed research response is missing its KRS identifier");
  }
  const krsCompany = await deps.krsProvider.fetchByKrs(krs, ctx.signal);
  if (krsCompany === null) {
    throw new CompanyResearchInternalError("Previously identified company no longer resolves in the registry");
  }

  const webResult = await assembleWebEnrichedProfile(
    { company: krsCompany, signal: ctx.signal },
    deps.webResearchDeps,
  );

  // Optional best-effort fallback: when the assembled profile is legal-only
  // (or otherwise missing the important business facts), ONE structured
  // OpenAI web-search call fills in what it can. On any failure it gracefully
  // returns the original assembled profile unchanged (see `enrichCompanyProfile`).
  const enrichment = await enrichCompanyProfile(
    { assembly: webResult.profileAssembly, company: krsCompany, foundedYearHint: response.query.foundedYear },
    { provider: deps.enrichmentProvider },
    { signal: ctx.signal },
  );
  const enrichedProfile = enrichment.profile;

  // The displayed sources are derived STRICTLY from FactEvidence across both the
  // deterministic assembly and the optional enrichment — the KRS registry plus
  // every source actually backing a fact (e.g. an official website the
  // enrichment discovered), origin-only and deduplicated by origin. A source is
  // never added just because a URL exists on the profile.
  const dashboardSources = deriveDashboardSources(
    [...webResult.profileAssembly.evidence, ...enrichment.evidence],
    [...webResult.profileAssembly.sources, ...enrichment.sources],
  );

  const expansionInput = buildExpansionAnalysisInput(enrichedProfile);
  let expansion;
  try {
    expansion = await deps.expansionAnalysisProvider.analyze(expansionInput, { signal: ctx.signal });
    logPipelineStage("expansion-analysis", "completed");
  } catch (error) {
    // A required-stage failure — logged, but never hidden: it still
    // propagates unchanged (see httpHandler's typed-error mapping).
    logPipelineStage("expansion-analysis", "error", stageErrorReasonCode(error));
    throw error;
  }

  return guardAndValidateDashboardResponse({
    status: "completed",
    requestId: response.requestId,
    query: response.query,
    company: toDashboardCompanyInfo(enrichedProfile, response.query.foundedYear),
    expansion,
    sources: dashboardSources,
  });
}
