import { COMPANY_RESEARCH_VERSION } from "../../contracts/companyResearch.ts";
import type { CompanyResearchResponse } from "../../contracts/companyResearch.ts";
import { InvalidKrsError, UnsupportedOperationError } from "./errors.ts";
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

/**
 * Domain service for Company Research. Normalizes the query, identifies the
 * company via the injected provider, assembles the appropriate domain response,
 * and runs it through the final guard (personal-data assertion + strict schema
 * validation) before returning.
 *
 * This is intentionally thin — every non-trivial transformation lives in a
 * separately unit-tested pure module.
 */
export async function researchCompany(
  request: CompanyResearchRequest,
  provider: CompanyDataProvider,
  ctx: ResearchContext,
): Promise<CompanyResearchResponse> {
  const { query, krsInvalid } = normalizeQuery(request);
  if (krsInvalid) {
    throw new InvalidKrsError();
  }

  // The multi-candidate confirmation flow is not implemented in stage 1. A
  // supplied candidate id is rejected with a controlled error rather than being
  // silently ignored (the message does not imply confirmation works yet).
  if (query.selectedCandidateId !== undefined) {
    throw new UnsupportedOperationError("selectedCandidateId is not supported in stage 1");
  }

  const result = await identifyCompany(query, provider, ctx.signal);

  let response: CompanyResearchResponse;
  switch (result.kind) {
    case "not_found":
      response = buildNotFoundResponse({ requestId: ctx.requestId, query });
      break;
    case "unsupported":
      response = buildUnsupportedResponse({
        requestId: ctx.requestId,
        query,
        reason: result.reason,
      });
      break;
    case "found":
      response = buildCompletedResponse({
        requestId: ctx.requestId,
        query,
        company: result.company,
        version: COMPANY_RESEARCH_VERSION,
        researchedAt: new Date().toISOString(),
      });
      break;
  }

  return guardAndValidateResponse(response);
}
