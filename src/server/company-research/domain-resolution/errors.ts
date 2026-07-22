/**
 * INTERNAL invariant error for Official Domain Resolution.
 *
 * This is raised ONLY for logically-impossible internal states (a broken
 * contract between the evaluation/confirmation modules and this orchestrator),
 * never for ordinary domain outcomes. It is deliberately NOT part of the public
 * `CompanyResearchErrorCode` union and does NOT extend the public
 * `CompanyResearchError` base — it must never travel through the public error
 * mapping. Its message contains only a stable code detail — never a company
 * name, URL, raw provider output or any rejected value.
 *
 * No `server-only` import: the module lives in the server tree but stays loadable
 * by the Node test runner (mirroring the sibling module error files).
 */

export type DomainResolutionErrorCode = "COMPANY_DOMAIN_RESOLUTION_INVARIANT";

/** A broken internal invariant in the domain-resolution orchestration. */
export class DomainResolutionInvariantError extends Error {
  readonly code: DomainResolutionErrorCode = "COMPANY_DOMAIN_RESOLUTION_INVARIANT";
  readonly publicMessage = "Wystąpił wewnętrzny błąd rozpoznawania domeny firmy.";

  constructor(message: string) {
    super(`Domain resolution invariant violated: ${message}`);
    this.name = "DomainResolutionInvariantError";
  }
}
