import { COMPANY_RESEARCH_VERSION } from "../../contracts/companyResearch.ts";
import type { CompanyResearchResponse } from "../../contracts/companyResearch.ts";
import { InvalidKrsError } from "./errors.ts";
import { confirmSelectedCandidate } from "./identification/confirmSelectedCandidate.ts";
import type { IdentificationBudget } from "./identification/identificationBudget.ts";
import { identifyByName } from "./identification/identifyByName.ts";
import type { CompanyIdentificationProvider } from "./identification/types.ts";
import {
  buildCompletedResponse,
  buildNotFoundResponse,
  buildUnsupportedResponse,
} from "./mappers/toDashboardResponse.ts";
import { identifyCompany } from "./resolution/identifyCompany.ts";
import { normalizeQuery } from "./resolution/normalizeQuery.ts";
import { guardAndValidateResponse } from "./responseGuard.ts";
import type { CompanyResearchRequest } from "./schema.ts";
import type { CompanyDataProvider } from "./types.ts";

export interface ResearchContext {
  requestId: string;
  signal?: AbortSignal;
}

/** All injected dependencies for the domain service (keeps it testable offline). */
export interface CompanyResearchDeps {
  krsProvider: CompanyDataProvider;
  identificationProvider: CompanyIdentificationProvider;
  /** Process-local safeguard for the paid name-identification flow. */
  identificationBudget: IdentificationBudget;
}

/**
 * Domain service for Company Research. Orchestrates the three flows and applies
 * the final guard (personal-data assertion + strict schema validation):
 *
 * 1. exact KRS  — direct registry lookup (unchanged from stage 1),
 * 2. selected candidate — confirm a user-chosen candidate WITHOUT web search,
 * 3. by name   — web-search discovery + KRS verification + deterministic match.
 *
 * Every non-trivial transformation lives in a separately unit-tested module.
 */
export async function researchCompany(
  request: CompanyResearchRequest,
  deps: CompanyResearchDeps,
  ctx: ResearchContext,
): Promise<CompanyResearchResponse> {
  const { query, krsInvalid } = normalizeQuery(request);
  if (krsInvalid) {
    throw new InvalidKrsError();
  }

  const flowCtx = {
    requestId: ctx.requestId,
    version: COMPANY_RESEARCH_VERSION,
    researchedAt: new Date().toISOString(),
    signal: ctx.signal,
  };

  let response: CompanyResearchResponse;

  if (query.krs !== undefined) {
    // Flow 1 — exact KRS (unchanged).
    const result = await identifyCompany(query, deps.krsProvider, ctx.signal);
    switch (result.kind) {
      case "not_found":
        response = buildNotFoundResponse({ requestId: ctx.requestId, query });
        break;
      case "unsupported":
        response = buildUnsupportedResponse({ requestId: ctx.requestId, query, reason: result.reason });
        break;
      case "found":
        response = buildCompletedResponse({
          requestId: ctx.requestId,
          query,
          company: result.company,
          version: flowCtx.version,
          researchedAt: flowCtx.researchedAt,
        });
        break;
    }
  } else if (query.selectedCandidateId !== undefined) {
    // Flow 2 — confirm a user-selected candidate (no web search).
    response = await confirmSelectedCandidate(
      query.selectedCandidateId,
      query,
      deps.krsProvider,
      flowCtx,
    );
  } else {
    // Flow 3 — identify by name (paid web search). Guard with the process-local
    // budget (feature flag + window + concurrency); the exact-KRS and selected-
    // candidate flows never consume this budget.
    const release = deps.identificationBudget.acquire();
    try {
      response = await identifyByName(
        query,
        { identificationProvider: deps.identificationProvider, krsProvider: deps.krsProvider },
        flowCtx,
      );
    } finally {
      release();
    }
  }

  return guardAndValidateResponse(response);
}
