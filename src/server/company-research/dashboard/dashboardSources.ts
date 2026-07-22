import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";

/**
 * Normalized dedup key for a source: web sources by their normalized origin,
 * non-web sources (e.g. the KRS registry, which has no URL) by their id.
 */
function dedupKey(source: ResearchSource): string {
  if (source.url !== null) {
    const safe = safeOriginFromUrl(source.url);
    if (safe !== null) return `origin:${safe.origin}`;
  }
  return `id:${source.id}`;
}

/**
 * Derives the sources shown in the dashboard "Źródła" section STRICTLY from
 * `FactEvidence`: a source is included ONLY when at least one evidence entry
 * references its id. A URL that merely sits on the profile is never enough — the
 * attribution must come from evidence.
 *
 * Web sources are already origin-only (scheme + host); they are deduplicated by
 * their normalized origin, so the same official domain never appears twice. The
 * KRS registry source (no URL) is kept by id. The result is deterministically
 * ordered: the registry first, then web sources by domain (then id).
 *
 * Pure and side-effect free — it copies nothing it does not need to and never
 * mutates its inputs.
 */
export function deriveDashboardSources(
  evidence: readonly FactEvidence[],
  sources: readonly ResearchSource[],
): ResearchSource[] {
  const referenced = new Set<string>();
  for (const entry of evidence) {
    for (const id of entry.sourceIds) referenced.add(id);
  }

  const byKey = new Map<string, ResearchSource>();
  for (const source of sources) {
    if (!referenced.has(source.id)) continue;
    const key = dedupKey(source);
    // First occurrence wins; callers pass assembly sources before enrichment
    // sources, so the canonical assembled source is preferred on a tie.
    if (!byKey.has(key)) byKey.set(key, source);
  }

  return [...byKey.values()].sort((a, b) => {
    const rank = (s: ResearchSource) => (s.provider === "krs" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const da = a.domain ?? "";
    const db = b.domain ?? "";
    if (da !== db) return da < db ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
