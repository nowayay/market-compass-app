import "server-only";
import { createOpenAiCompanyBusinessResearchProvider } from "./companyBusinessResearchProvider";
import { getBusinessResearchBudget } from "./getBusinessResearchBudget";
import { researchCompanyBusiness } from "./researchCompanyBusiness";
import type {
  BusinessResearchRequest,
  ResearchBusinessDeps,
  StructuredBusinessResearchResult,
} from "./types";

/**
 * Thin server-only assembler for internal Structured Business Research.
 *
 * It wires the EXISTING lazy production provider, the singleton budget, and a
 * real system clock for `ResearchSource.retrievedAt`. It creates no extra
 * provider clients (the lazy wrapper is a process singleton), starts NO research
 * on import, and is deliberately NOT wired into `researchCompany`, domain
 * resolution, route handlers, the public API or the dashboard.
 */
export function createBusinessResearchDeps(): ResearchBusinessDeps {
  return {
    provider: createOpenAiCompanyBusinessResearchProvider(),
    budget: getBusinessResearchBudget(),
    now: () => new Date(),
  };
}

/** Convenience default-dependency runner (one research execution). */
export function researchCompanyBusinessWithDefaultDeps(
  request: BusinessResearchRequest,
  options?: { signal?: AbortSignal },
): Promise<StructuredBusinessResearchResult> {
  return researchCompanyBusiness(request, createBusinessResearchDeps(), options);
}
