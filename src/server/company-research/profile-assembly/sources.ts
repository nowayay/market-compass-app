/**
 * Deterministic `ResearchSource` merging + confirmed-website source construction.
 *
 * All sources are origin-only (scheme + host, or null). Merging deduplicates by
 * stable id, rejects an id reused with conflicting content, and orders the result
 * canonically by id. Inputs are never mutated — every retained source is copied.
 */
import { businessSourceId } from "../business-research/ids.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { ProfileAssemblyInvariantError } from "./errors.ts";
import type { ResearchSource } from "../../../contracts/companyResearch.ts";

/** A returned copy of a source (no aliasing with the input object). */
export function cloneSource(source: ResearchSource): ResearchSource {
  return {
    id: source.id,
    provider: source.provider,
    type: source.type,
    authority: source.authority,
    url: source.url,
    domain: source.domain,
    retrievedAt: source.retrievedAt,
    publishedAt: source.publishedAt,
  };
}

/** Structural equality across every field (the id is derived from content only). */
function sourcesEqual(a: ResearchSource, b: ResearchSource): boolean {
  return (
    a.id === b.id &&
    a.provider === b.provider &&
    a.type === b.type &&
    a.authority === b.authority &&
    a.url === b.url &&
    a.domain === b.domain &&
    a.retrievedAt === b.retrievedAt &&
    a.publishedAt === b.publishedAt
  );
}

/**
 * Builds the canonical confirmed-website source for an already-validated
 * origin-only confirmed origin. Its id is derived from the normalized origin ONLY
 * (never from `retrievedAt`), so the same origin always yields the same id.
 * `retrievedAt` uses the injected clock because this is a genuinely new source.
 */
export function buildWebsiteSource(confirmedOrigin: string, retrievedAt: string): ResearchSource {
  const safe = safeOriginFromUrl(confirmedOrigin);
  if (safe === null || safe.origin !== confirmedOrigin) {
    throw new ProfileAssemblyInvariantError("confirmed website origin is not origin-only");
  }
  return {
    id: businessSourceId(confirmedOrigin),
    provider: "openai_web_search",
    type: "official_company_website",
    authority: "primary",
    url: confirmedOrigin, // origin-only
    domain: safe.hostname,
    retrievedAt,
    // A confirmed official domain has no trustworthy single publication date.
    publishedAt: null,
  };
}

/** The stable id a confirmed-website source has for a given origin. */
export function websiteSourceId(confirmedOrigin: string): string {
  return businessSourceId(confirmedOrigin);
}

/**
 * Merges sources into one deduplicated, canonically ordered list. Two sources
 * with the same id but any differing field are an impossible collision and throw
 * (never a silent pick). Ordering is by id (ascending), which is fully stable and
 * independent of input order. Inputs are copied, never mutated.
 */
export function mergeSources(sources: readonly ResearchSource[]): ResearchSource[] {
  const byId = new Map<string, ResearchSource>();
  for (const source of sources) {
    const existing = byId.get(source.id);
    if (existing !== undefined) {
      if (!sourcesEqual(existing, source)) {
        throw new ProfileAssemblyInvariantError("conflicting duplicate source id");
      }
      continue;
    }
    byId.set(source.id, cloneSource(source));
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
