/**
 * INTERNAL invariant error for Full Company Web Research Orchestration.
 *
 * This is raised ONLY for logically-impossible internal states (a broken
 * contract between domain resolution / business research / profile assembly and
 * this orchestrator), never for an ordinary pipeline outcome. It is deliberately
 * NOT part of the public `CompanyResearchErrorCode` union and does NOT extend the
 * public `CompanyResearchError` base — it must never travel through the public
 * error mapping. Its message contains only a stable code detail — never a company
 * name, KRS/NIP/REGON, domain, source URL, business fact or any rejected value.
 *
 * No `server-only` import: the module lives in the server tree but stays loadable
 * by the Node test runner (mirroring the sibling module error files).
 */

export type CompanyWebResearchErrorCode = "COMPANY_WEB_RESEARCH_INVARIANT";

/** A broken internal invariant in the Full Company Web Research orchestration. */
export class CompanyWebResearchInvariantError extends Error {
  readonly code: CompanyWebResearchErrorCode = "COMPANY_WEB_RESEARCH_INVARIANT";
  readonly publicMessage = "Wystąpił wewnętrzny błąd pełnej analizy internetowej firmy.";

  constructor(message: string) {
    super(`Company web research invariant violated: ${message}`);
    this.name = "CompanyWebResearchInvariantError";
  }
}
