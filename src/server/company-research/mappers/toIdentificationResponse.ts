import type {
  CompanyCandidate,
  NeedsConfirmationResponse,
  ResearchSource,
  ResearchSourceType,
} from "../../../contracts/companyResearch.ts";
import { createCandidateId } from "../identification/candidateId.ts";
import { neutralSourceTitle } from "../identification/webSourceSecurity.ts";
import { toResponseQuery } from "./toDashboardResponse.ts";
import type { SafeDiscoveredSource } from "../identification/webSourceSecurity.ts";
import type { ScoredCandidate } from "../identification/types.ts";
import type { KrsCompany, NormalizedQuery } from "../types.ts";

/** Non-cryptographic 32-bit FNV-1a hash (for stable, dedup-friendly source ids). */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function webSourceType(hostname: string): ResearchSourceType {
  if (hostname === "gov.pl" || hostname.endsWith(".gov.pl")) return "government";
  return "other";
}

/** The official KRS provenance source for a specific candidate entity. */
export function buildKrsSourceFor(company: KrsCompany): ResearchSource {
  return {
    id: `src_krs_${company.krs}`,
    provider: "krs",
    type: "official_registry",
    title: "Krajowy Rejestr Sądowy (odpis aktualny)",
    retrievedAt: company.retrievedAt,
    authority: "primary",
    supports: ["company.identity.legalName", "company.identity.identifiers.krs"],
  };
}

/**
 * Maps a safe web source (origin + hostname only) to a public ResearchSource.
 * Never carries the full path, query, fragment, upstream title or page content.
 */
export function buildWebSource(source: SafeDiscoveredSource, retrievedAt: string): ResearchSource {
  return {
    id: `src_web_${fnv1a(source.origin)}`,
    provider: "web",
    type: webSourceType(source.hostname),
    title: neutralSourceTitle(source.hostname),
    url: source.origin,
    domain: source.hostname,
    retrievedAt,
    authority: "secondary",
    supports: ["candidate.discovery"],
  };
}

/**
 * Builds the public CompanyCandidate from a scored (KRS-verified) candidate.
 * `sourceIds` intentionally references ONLY the candidate's own KRS source —
 * web sources cannot be reliably attributed to a specific KRS, so they stay at
 * the response level and are not claimed per-candidate.
 */
export function buildCompanyCandidate(scored: ScoredCandidate, sourceIds: string[]): CompanyCandidate {
  const c = scored.krsCompany;
  return {
    candidateId: createCandidateId(c.krs),
    legalName: c.legalName,
    identifiers: { krs: c.krs, nip: c.nip, regon: c.regon },
    legalForm: c.legalForm,
    city: c.city,
    region: c.region,
    countryCode: "PL",
    // foundedYear is NOT copied as a confirmed fact in this stage.
    registrationDate: c.registrationDate,
    confidence: scored.confidence,
    matchReasons: scored.matchReasons,
    sourceIds,
  };
}

/** Deterministic order: confidence desc, then legalName asc, then KRS asc. */
function compareCandidates(a: CompanyCandidate, b: CompanyCandidate): number {
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  const byName = a.legalName.localeCompare(b.legalName, "pl");
  if (byName !== 0) return byName;
  return (a.identifiers.krs ?? "").localeCompare(b.identifiers.krs ?? "");
}

/**
 * Assembles a needs_confirmation response. Candidates are sorted deterministically
 * (never in model order). Sources = each candidate's KRS source + the response-
 * level web sources, deduplicated by id.
 */
export function buildNeedsConfirmationResponse(args: {
  requestId: string;
  query: NormalizedQuery;
  scored: ScoredCandidate[];
  webSources: SafeDiscoveredSource[];
  retrievedAt: string;
}): NeedsConfirmationResponse {
  const sourcesById = new Map<string, ResearchSource>();
  const candidates: CompanyCandidate[] = [];

  for (const scored of args.scored) {
    const krsSource = buildKrsSourceFor(scored.krsCompany);
    sourcesById.set(krsSource.id, krsSource);
    candidates.push(buildCompanyCandidate(scored, [krsSource.id]));
  }

  for (const source of args.webSources) {
    const webSource = buildWebSource(source, args.retrievedAt);
    if (!sourcesById.has(webSource.id)) sourcesById.set(webSource.id, webSource);
  }

  candidates.sort(compareCandidates);

  return {
    status: "needs_confirmation",
    requestId: args.requestId,
    query: toResponseQuery(args.query),
    candidates,
    sources: [...sourcesById.values()],
  };
}

/** The response-level web sources for a completed name-flow result. */
export function buildCompletedWebSources(
  webSources: SafeDiscoveredSource[],
  retrievedAt: string,
): ResearchSource[] {
  const byId = new Map<string, ResearchSource>();
  for (const source of webSources) {
    const webSource = buildWebSource(source, retrievedAt);
    if (!byId.has(webSource.id)) byId.set(webSource.id, webSource);
  }
  return [...byId.values()];
}
