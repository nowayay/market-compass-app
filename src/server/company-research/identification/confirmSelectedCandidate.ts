import type { CompanyResearchResponse } from "../../../contracts/companyResearch.ts";
import { CandidateNotFoundError, InvalidCandidateIdError } from "../errors.ts";
import {
  buildCompletedResponse,
  buildUnsupportedResponse,
} from "../mappers/toDashboardResponse.ts";
import { classifyEntityType } from "../resolution/identifyCompany.ts";
import { parseCandidateId } from "./candidateId.ts";
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
 * - return completed for the confirmed entity.
 *
 * Deliberately does NOT re-derive a name match against `query.name`: every
 * candidate the identification stage returned in `needs_confirmation` was, by
 * definition, already confirmed against the official KRS registry — a human
 * explicitly picking one of them (by its real legal name/city/KRS shown in
 * the UI) is a stronger signal than any text-similarity heuristic, and must
 * never be second-guessed by re-running the very score that put it in
 * `needs_confirmation` in the first place (that would make an entire class of
 * legitimately returned candidates unselectable). The only reasons to reject
 * a selection are a malformed id or a KRS number that does not resolve.
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

  return buildCompletedResponse({
    requestId: ctx.requestId,
    query,
    company: krsCompany,
    version: ctx.version,
    researchedAt: ctx.researchedAt,
  });
}
