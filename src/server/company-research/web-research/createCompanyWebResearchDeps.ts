import "server-only";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { resolveCompanyDomainWithDefaultDeps } from "../domain-resolution/createCompanyDomainResolution.ts";
import { researchCompanyBusinessWithDefaultDeps } from "../business-research/createBusinessResearch.ts";
import type { CompanyWebResearchDeps } from "./types.ts";

/**
 * Thin server-only assembler for the production `orchestrateCompanyWebResearch`
 * dependencies. It reuses the EXISTING lazy production providers/budgets for
 * both paid sub-stages (via their own `*WithDefaultDeps` convenience runners)
 * and the pure `assembleCompanyProfile` — it creates no extra provider
 * instances and starts NO research on import.
 */
export function createCompanyWebResearchDeps(): CompanyWebResearchDeps {
  return {
    resolveCompanyDomain: resolveCompanyDomainWithDefaultDeps,
    researchCompanyBusiness: researchCompanyBusinessWithDefaultDeps,
    assembleCompanyProfile,
    now: () => new Date(),
  };
}
