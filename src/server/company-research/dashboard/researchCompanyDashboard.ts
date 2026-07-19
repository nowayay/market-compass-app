import type {
  CompanyDashboardResponse,
  DashboardCompanyInfo,
} from "../../../contracts/companyDashboard.ts";
import { buildSkippedResult } from "../business-research/buildBusinessResult.ts";
import { CompanyResearchInternalError } from "../errors.ts";
import { buildExpansionAnalysisInput } from "../expansion-analysis/buildExpansionAnalysisInput.ts";
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
 * Maps the assembled, web-enriched `CompanyProfile` onto the flat dashboard
 * company-info shape. `foundedYear` is the user-supplied identification hint
 * echoed back from the query — never a verified registry fact (KRS carries no
 * founding date; see `mappers/toDashboardResponse.buildCompanyProfile`).
 */
function toDashboardCompanyInfo(profile: CompanyProfile, foundedYear: number | undefined): DashboardCompanyInfo {
  return {
    legalName: profile.identity.legalName,
    krs: profile.identity.identifiers.krs,
    nip: profile.identity.identifiers.nip,
    regon: profile.identity.identifiers.regon,
    foundedYear,
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
    return await orchestrateCompanyWebResearch(request, deps);
  } catch (error) {
    if (!isWebResearchUnavailable(error)) throw error;
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
 * a 5-country ranking).
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

  const expansionInput = buildExpansionAnalysisInput(webResult.profileAssembly.profile);
  const expansion = await deps.expansionAnalysisProvider.analyze(expansionInput, { signal: ctx.signal });

  return guardAndValidateDashboardResponse({
    status: "completed",
    requestId: response.requestId,
    query: response.query,
    company: toDashboardCompanyInfo(webResult.profileAssembly.profile, response.query.foundedYear),
    expansion,
    sources: webResult.profileAssembly.sources,
  });
}
