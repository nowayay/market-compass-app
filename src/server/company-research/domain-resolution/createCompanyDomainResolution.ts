import "server-only";
import { createOpenAiCompanyDomainDiscoveryProvider } from "../domain-discovery/companyDomainDiscoveryProvider";
import { getDomainDiscoveryBudget } from "../domain-discovery/getDomainDiscoveryBudget";
import { createOpenAiCompanyDomainConfirmationProvider } from "../domain-confirmation/companyDomainConfirmationProvider";
import { getConfirmationBudget } from "../domain-confirmation/getConfirmationBudget";
import { resolveCompanyDomain } from "./resolveCompanyDomain";
import type { CompanyDomainResolutionResult, ResolveCompanyDomainDeps } from "./types";
import type { KrsCompany } from "../types";

/**
 * Thin server-only assembler for internal Official Domain Resolution.
 *
 * It wires the EXISTING lazy production providers and singleton budgets for both
 * paid flows — it creates no extra provider instances (the lazy wrappers/getters
 * are process singletons) and starts NO resolution on import. It is deliberately
 * NOT wired into `researchCompany`, route handlers, the public API or the
 * dashboard.
 */
export function createCompanyDomainResolutionDeps(): ResolveCompanyDomainDeps {
  return {
    discoveryProvider: createOpenAiCompanyDomainDiscoveryProvider(),
    discoveryBudget: getDomainDiscoveryBudget(),
    confirmationProvider: createOpenAiCompanyDomainConfirmationProvider(),
    confirmationBudget: getConfirmationBudget(),
  };
}

/**
 * Convenience default-dependency resolver: builds the production deps from the
 * shared lazy providers/budgets and runs one resolution. Config + OpenAI client
 * are only touched when the underlying paid flows actually run.
 */
export function resolveCompanyDomainWithDefaultDeps(
  company: KrsCompany,
  options?: { signal?: AbortSignal },
): Promise<CompanyDomainResolutionResult> {
  return resolveCompanyDomain(company, createCompanyDomainResolutionDeps(), options);
}
