/**
 * Internal types for Full Company Web Research Orchestration.
 *
 * Pure types only (no runtime imports) so the orchestrator and its tests can
 * depend on this without pulling in any server-only or bundler-only code.
 *
 * This stage is INTERNAL: it is not wired into the public Company Research API,
 * `researchCompany`, any route or the dashboard. It REUSES the existing internal
 * domain-resolution / business-research / profile-assembly result types (no
 * duplicate types) and produces only a minimal internal result wrapper.
 */
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type {
  BusinessResearchRequest,
  StructuredBusinessResearchResult,
} from "../business-research/types.ts";
import type {
  AssembleCompanyProfileDeps,
  CompanyProfileAssemblyInput,
  CompanyProfileAssemblyResult,
} from "../profile-assembly/types.ts";
import type { KrsCompany } from "../types.ts";

/**
 * The internal pipeline request. Accepts ONLY the already sanitized KRS company
 * (no raw request query, no raw KRS API payload, no user-provided website).
 */
export interface CompanyWebResearchRequest {
  company: KrsCompany;
  signal?: AbortSignal;
}

/**
 * Injected dependencies. Each stage keeps OWNERSHIP of its own network/provider/
 * budget concerns — this orchestrator never sees a provider, a budget or an
 * environment variable, and never constructs one. `resolveCompanyDomain` and
 * `researchCompanyBusiness` are narrowed to the call shape this stage actually
 * needs (company/request + an optional abort signal in, a `Promise<Result>`
 * out); a caller composes them from the real functions bound to their own
 * low-level deps. `assembleCompanyProfile` keeps its REAL two-argument
 * signature so the injected clock (`now`) is threaded through to Profile
 * Assembly rather than read by this orchestrator directly.
 */
export interface CompanyWebResearchDeps {
  resolveCompanyDomain: (
    company: KrsCompany,
    options?: { signal?: AbortSignal },
  ) => Promise<CompanyDomainResolutionResult>;
  researchCompanyBusiness: (
    request: BusinessResearchRequest,
    options?: { signal?: AbortSignal },
  ) => Promise<StructuredBusinessResearchResult>;
  assembleCompanyProfile: (
    input: CompanyProfileAssemblyInput,
    deps: AssembleCompanyProfileDeps,
  ) => CompanyProfileAssemblyResult;
  /** Injected clock, forwarded to Profile Assembly — never called directly here. */
  now: () => Date;
}

/**
 * The single internal Full Company Web Research result. INTERNAL only (no public
 * API wiring). Reuses the existing internal per-stage result types and carries no
 * raw provider responses, prompts, snippets, titles, exact page URLs, person data,
 * internal exceptions or budgets.
 */
export interface CompanyWebResearchResult {
  domainResolution: CompanyDomainResolutionResult;
  businessResearch: StructuredBusinessResearchResult;
  profileAssembly: CompanyProfileAssemblyResult;
}
