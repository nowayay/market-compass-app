import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import {
  buildDomainConfirmationInput,
  buildExpectedIdentifiers,
} from "./buildDomainConfirmationInput.ts";
import {
  evaluateDomainConfirmation,
  unavailableConfirmationResult,
} from "./evaluateDomainConfirmation.ts";
import type { DomainConfirmationBudget } from "./confirmationBudget.ts";
import type { CompanyDomainConfirmationProvider, DomainConfirmationResult } from "./types.ts";
import type { CompanyDomainEvaluationResult } from "../domain-evaluation/types.ts";
import type { KrsCompany } from "../types.ts";

export interface ConfirmCompanyDomainDeps {
  provider: CompanyDomainConfirmationProvider;
  /** Process-local safeguard for the paid confirmation flow. */
  budget: DomainConfirmationBudget;
}

/**
 * Orchestration boundary for evidence-backed official-domain confirmation.
 *
 * It runs ONLY for an evaluation that selected exactly one `probable` candidate;
 * for `unverified` / `not_found` (or no selected candidate) it returns a
 * fail-closed `unverified` result WITHOUT touching the paid flow or the budget.
 *
 * Ordering: gate first, then acquire the budget (so a disabled / rate-limited /
 * busy flow makes no OpenAI call and propagates a typed error), build +
 * privacy-check the allowlisted input (which never contains the expected
 * identifiers), run the provider, privacy-check its result, run the pure
 * deterministic evaluation with the EXPECTED identifiers (used only here), and
 * ALWAYS release the budget in `finally`.
 *
 * Fail-closed: a provider timeout, refusal, incomplete response or failure yields
 * `unverified` (never `confirmed`, never `conflict`). Caller cancellation
 * propagates.
 *
 * It is NOT wired into the public API and never sets `website.verified` /
 * `website.domain` / `website.url`.
 */
export async function confirmCompanyDomain(
  company: KrsCompany,
  evaluation: CompanyDomainEvaluationResult,
  deps: ConfirmCompanyDomainDeps,
  options?: { signal?: AbortSignal },
): Promise<DomainConfirmationResult> {
  const selected = evaluation.status === "probable" ? evaluation.selectedCandidate : null;
  if (selected === null) {
    // Nothing to confirm — never acquire the budget or call the provider.
    return unavailableConfirmationResult();
  }

  const target = { origin: selected.origin, domain: selected.domain };

  const release = deps.budget.acquire();
  try {
    const input = buildDomainConfirmationInput(company, target);
    // Privacy check the allowlisted input BEFORE anything is sent to the model.
    assertNoPersonalData(input, "domainConfirmationInput");

    // EXPECTED identifiers are built here and used ONLY in the backend
    // comparison below — they are NEVER forwarded to the provider.
    const expected = buildExpectedIdentifiers(company);

    let providerResult;
    try {
      providerResult = await deps.provider.confirmDomain(input, { signal: options?.signal });
    } catch (cause) {
      if (options?.signal?.aborted) throw cause; // caller cancellation propagates
      // Fail closed: timeout / refusal / incomplete / provider failure → unverified.
      return unavailableConfirmationResult();
    }

    // Privacy check the provider result (defense-in-depth).
    assertNoPersonalData(providerResult, "domainConfirmationProviderResult");

    const result = evaluateDomainConfirmation(
      expected,
      providerResult.found,
      providerResult.sourceOrigins,
      input.targetOrigin,
    );

    // Defense-in-depth over the final internal result (origins + enum codes only).
    assertNoPersonalData(result, "domainConfirmationResult");
    return result;
  } finally {
    release();
  }
}
