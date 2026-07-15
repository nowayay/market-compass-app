import type { CompanyResearchResponse } from "../../../contracts/companyResearch.ts";
import {
  buildCompletedResponse,
  buildNotFoundResponse,
} from "../mappers/toDashboardResponse.ts";
import {
  buildCompletedWebSources,
  buildNeedsConfirmationResponse,
} from "../mappers/toIdentificationResponse.ts";
import { classifyEntityType } from "../resolution/identifyCompany.ts";
import { decideIdentification, scoreCandidates } from "./matchCompanyCandidates.ts";
import type { CompanyIdentificationProvider, VerifiedCandidate } from "./types.ts";
import type { CompanyDataProvider, NormalizedQuery } from "../types.ts";

export interface IdentifyByNameDeps {
  identificationProvider: CompanyIdentificationProvider;
  krsProvider: CompanyDataProvider;
}

export interface IdentifyByNameContext {
  requestId: string;
  version: string;
  researchedAt: string;
  signal?: AbortSignal;
}

/** Hard cap on KRS verification calls per single name search. */
export const MAX_KRS_VERIFICATIONS = 5;

/**
 * Identifies a company by name:
 * 1. discover candidate KRS numbers via web search (provider returns validated
 *    candidates deduped by KRS, plus REAL tool-attested sources),
 * 2. confirm EACH unique KRS against the official registry (≤ 5 calls, never the
 *    same KRS twice), dropping 404s, natural-person entities and incomplete data,
 * 3. score verified candidates deterministically (KRS + name + independent
 *    source hostnames),
 * 4. decide completed / needs_confirmation / not_found.
 *
 * All legal data comes from KRS; web sources only corroborate discovery. Both
 * providers are injected, so this is fully testable offline.
 */
export async function identifyByName(
  query: NormalizedQuery,
  deps: IdentifyByNameDeps,
  ctx: IdentifyByNameContext,
): Promise<CompanyResearchResponse> {
  const discovery = await deps.identificationProvider.discoverCandidates(
    { name: query.name, countryCode: query.countryCode, foundedYear: query.foundedYear },
    ctx.signal,
  );

  const distinctSourceHostnames = new Set(discovery.sources.map((s) => s.hostname)).size;

  const verified: VerifiedCandidate[] = [];
  const seenKrs = new Set<string>();
  for (const candidate of discovery.candidates) {
    if (seenKrs.has(candidate.krs)) continue; // never call the same KRS twice
    // Hard cap on registry calls per name search (defense-in-depth; discovery
    // already caps candidates at MAX_DISCOVERED_CANDIDATES).
    if (seenKrs.size >= MAX_KRS_VERIFICATIONS) break;
    seenKrs.add(candidate.krs);

    const krsCompany = await deps.krsProvider.fetchByKrs(candidate.krs, ctx.signal);
    if (krsCompany === null) continue; // 404 / not in registry
    if (krsCompany.legalName.length === 0) continue; // incomplete data
    if (classifyEntityType(krsCompany.legalForm) === "natural_person_business") continue;

    verified.push({ krsCompany, discovered: candidate });
  }

  const scored = scoreCandidates(query, verified, distinctSourceHostnames);
  const decision = decideIdentification(scored);

  if (decision === "not_found") {
    return buildNotFoundResponse({ requestId: ctx.requestId, query });
  }

  if (decision === "completed") {
    return buildCompletedResponse({
      requestId: ctx.requestId,
      query,
      company: scored[0].krsCompany,
      version: ctx.version,
      researchedAt: ctx.researchedAt,
      extraSources: buildCompletedWebSources(discovery.sources, ctx.researchedAt),
    });
  }

  return buildNeedsConfirmationResponse({
    requestId: ctx.requestId,
    query,
    scored,
    webSources: discovery.sources,
    retrievedAt: ctx.researchedAt,
  });
}
