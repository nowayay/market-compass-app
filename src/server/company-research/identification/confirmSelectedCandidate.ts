import type { CompanyResearchResponse } from "../../../contracts/companyResearch.ts";
import {
  CandidateNotFoundError,
  CandidateQueryMismatchError,
  InvalidCandidateIdError,
} from "../errors.ts";
import {
  buildCompletedResponse,
  buildUnsupportedResponse,
} from "../mappers/toDashboardResponse.ts";
import { classifyEntityType } from "../resolution/identifyCompany.ts";
import { parseCandidateId } from "./candidateId.ts";
import { strengthFor } from "./matchCompanyCandidates.ts";
import { nameMatchScore } from "./normalizeCompanyName.ts";
import type { CompanyDataProvider, NormalizedQuery } from "../types.ts";

export interface ConfirmContext {
  requestId: string;
  version: string;
  researchedAt: string;
  signal?: AbortSignal;
}

/**
 * Confirms a user-selected candidate WITHOUT any web search:
 * - parse & validate the candidateId (→ INVALID_CANDIDATE_ID),
 * - fetch the entity from the official KRS (→ CANDIDATE_NOT_FOUND on 404),
 * - reject natural-person entities (unsupported_entity_type),
 * - require an exact or strong name match with the query, conservatively
 *   rejecting a weak match (→ CANDIDATE_QUERY_MISMATCH),
 * - return completed for the confirmed entity.
 */
export async function confirmSelectedCandidate(
  candidateId: string,
  query: NormalizedQuery,
  krsProvider: CompanyDataProvider,
  ctx: ConfirmContext,
): Promise<CompanyResearchResponse> {
  const parts = parseCandidateId(candidateId);
  if (parts === null) {
    throw new InvalidCandidateIdError();
  }

  const krsCompany = await krsProvider.fetchByKrs(parts.krs, ctx.signal);
  if (krsCompany === null) {
    throw new CandidateNotFoundError();
  }

  if (classifyEntityType(krsCompany.legalForm) === "natural_person_business") {
    return buildUnsupportedResponse({
      requestId: ctx.requestId,
      query,
      reason: "natural_person_business",
    });
  }

  // Re-derive the match from the public registry name; accept only an exact or
  // strong match, conservatively rejecting a weak one.
  const score = nameMatchScore(query.name, krsCompany.legalName);
  if (strengthFor(score) === "weak") {
    throw new CandidateQueryMismatchError();
  }

  return buildCompletedResponse({
    requestId: ctx.requestId,
    query,
    company: krsCompany,
    version: ctx.version,
    researchedAt: ctx.researchedAt,
  });
}
