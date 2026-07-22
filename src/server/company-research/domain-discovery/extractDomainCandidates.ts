import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { isBlockedDomain } from "./blockedDomains.ts";
import { MAX_DOMAIN_CANDIDATES } from "./schema.ts";
import type { SafeDiscoveredSource } from "../identification/webSourceSecurity.ts";
import type { RawDomainCandidate } from "./schema.ts";
import type { DiscoveredDomainCandidate } from "./types.ts";

/**
 * Deterministic tool-attested URL matching.
 *
 * For every structured candidate URL:
 *  1. parse + validate via the existing URL-security policy (rejects unusable /
 *     credential-bearing URLs, unsupported protocols, localhost and IP literals),
 *  2. normalize to a safe ORIGIN (path/query/fragment dropped — the exact page is
 *     never retained),
 *  3. accept ONLY if that origin appears among the provider-attested Web Search
 *     source origins (a URL written only in model text is rejected),
 *  4. reject blocked (non-company) domains and their subdomains,
 *  5. deduplicate by normalized origin, capped at MAX_DOMAIN_CANDIDATES.
 *
 * Matching policy (documented + tested): a candidate matches when its normalized
 * origin equals a normalized attested-source origin. Because both sides are
 * reduced to origin first, a candidate page and an attested page under the SAME
 * origin match even when their exact paths differ.
 */
export function extractDomainCandidates(
  rawCandidates: RawDomainCandidate[],
  attestedSources: SafeDiscoveredSource[],
): DiscoveredDomainCandidate[] {
  const attestedOrigins = new Set(attestedSources.map((s) => s.origin));

  const byOrigin = new Map<string, DiscoveredDomainCandidate>();
  for (const candidate of rawCandidates) {
    const safe = safeOriginFromUrl(candidate.url);
    if (safe === null) continue; // invalid / credentials / localhost / IP / scheme
    if (!attestedOrigins.has(safe.origin)) continue; // not tool-attested
    if (isBlockedDomain(safe.hostname)) continue; // blocked category
    if (byOrigin.has(safe.origin)) continue; // dedup by origin

    byOrigin.set(safe.origin, {
      origin: safe.origin,
      domain: safe.hostname,
      signals: candidate.signals,
      // The attested origin is the only provenance retained (origin-only).
      sourceOrigins: [safe.origin],
    });
    if (byOrigin.size >= MAX_DOMAIN_CANDIDATES) break;
  }

  const result = [...byOrigin.values()];
  // Defense-in-depth over the final internal result (no exact URLs, no PII).
  assertNoPersonalData(result, "domainCandidates");
  return result;
}
