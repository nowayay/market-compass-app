import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { buildDomainDiscoveryInput } from "./buildDomainDiscoveryInput.ts";
import type { DomainDiscoveryBudget } from "./domainDiscoveryBudget.ts";
import type {
  CompanyDomainDiscoveryProvider,
  CompanyDomainDiscoveryResult,
} from "./types.ts";
import type { KrsCompany } from "../types.ts";

export interface DiscoverCompanyDomainsDeps {
  provider: CompanyDomainDiscoveryProvider;
  /** Process-local safeguard for the paid discovery flow. */
  budget: DomainDiscoveryBudget;
}

/**
 * Orchestration boundary for official-domain discovery.
 *
 * Accepts an ALREADY KRS-confirmed company and returns internal domain
 * candidates. It is NOT wired into the public API and never sets
 * `website.verified` / `website.domain` / `website.url` — a discovered candidate
 * is not verified or official yet.
 *
 * Ordering: acquire the budget FIRST (so a disabled / rate-limited / busy flow
 * makes no OpenAI call), build + privacy-check the allowlisted input, run the
 * provider, privacy-check the result, and ALWAYS release the budget in `finally`.
 * The exact-KRS and disabled paths never reach here, so they consume no budget.
 */
export async function discoverCompanyDomains(
  company: KrsCompany,
  deps: DiscoverCompanyDomainsDeps,
  options?: { signal?: AbortSignal },
): Promise<CompanyDomainDiscoveryResult> {
  const release = deps.budget.acquire();
  try {
    const input = buildDomainDiscoveryInput(company);
    // Privacy check the allowlisted input BEFORE anything is sent to the model.
    assertNoPersonalData(input, "domainDiscoveryInput");

    const result = await deps.provider.discoverDomainCandidates(input, {
      signal: options?.signal,
    });

    // Privacy check the final internal result (defense-in-depth).
    assertNoPersonalData(result, "domainDiscoveryResult");
    return result;
  } finally {
    release();
  }
}
