import type {
  CompanyResearchResponse,
  ResearchSource,
} from "../../contracts/companyResearch.ts";
import { safeOriginFromUrl } from "./identification/webSourceSecurity.ts";

/**
 * Deterministic, cross-field SEMANTIC validation of a response.
 *
 * The strict Zod schema validates each object in isolation but cannot express
 * referential integrity (an evidence entry pointing at a source that exists) or
 * the origin-only source-security policy (which lives in `safeOriginFromUrl` and
 * depends on `node:net`, so it must not run in the shared, browser-safe schema).
 *
 * This module is the single place those response-wide invariants are enforced,
 * server-side, right before a response leaves the server. It is pure and returns
 * a server-side-only reason string on the first violation (never surfaced to a
 * client), or `null` when the response is internally consistent.
 *
 * Invariants enforced:
 *  1. every `sources[].id` is unique within the response,
 *  2. every completed `evidence.facts[].id` is unique,
 *  3. every `evidence.facts[].sourceIds` entry references an existing source,
 *  4. every `candidates[].sourceIds` entry references an existing source,
 *  5. no evidence entry has an empty source set,
 *  6. `domain` matches the URL hostname whenever both are non-null,
 *  7. every non-null public `url` is exactly a policy-compliant origin
 *     (origin-only, http/https, no credentials, no localhost, no IP literal),
 *     re-verified through the one authoritative policy `safeOriginFromUrl`.
 */
export function findResponseIntegrityViolation(
  response: CompanyResearchResponse,
): string | null {
  const sources: ResearchSource[] = "sources" in response ? response.sources : [];

  // (1) unique source ids + (6,7) per-source url/domain policy.
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) return `duplicate source id: ${source.id}`;
    sourceIds.add(source.id);

    const urlViolation = checkSourceUrl(source);
    if (urlViolation !== null) return urlViolation;
  }

  // (2,3,5) completed-response evidence referential integrity.
  if (response.status === "completed") {
    const factIds = new Set<string>();
    for (const fact of response.evidence.facts) {
      if (factIds.has(fact.id)) return `duplicate evidence id: ${fact.id}`;
      factIds.add(fact.id);

      if (fact.sourceIds.length === 0) return `evidence ${fact.id} has an empty source set`;
      for (const id of fact.sourceIds) {
        if (!sourceIds.has(id)) return `evidence ${fact.id} references unknown source ${id}`;
      }
    }
  }

  // (4) needs_confirmation candidate → source referential integrity.
  if (response.status === "needs_confirmation") {
    for (const candidate of response.candidates) {
      for (const id of candidate.sourceIds) {
        if (!sourceIds.has(id)) {
          return `candidate ${candidate.candidateId} references unknown source ${id}`;
        }
      }
    }
  }

  return null;
}

/** Re-verifies a single source's url/domain against the origin-only policy. */
function checkSourceUrl(source: ResearchSource): string | null {
  if (source.url === null) return null; // nothing to verify (e.g. KRS source)

  const safe = safeOriginFromUrl(source.url);
  if (safe === null) return `source ${source.id} has a disallowed url`;
  if (safe.origin !== source.url) return `source ${source.id} url is not origin-only`;
  if (source.domain !== null && source.domain !== safe.hostname) {
    return `source ${source.id} domain does not match its url hostname`;
  }
  return null;
}
