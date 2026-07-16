import { extractWebSearchSources } from "../identification/extractWebSearchSources.ts";
import { isTargetHost } from "./targetHosts.ts";

/**
 * Extracts on-target-domain, provider-attested source ORIGINS from a Responses
 * API result.
 *
 * It reuses `extractWebSearchSources`, which takes sources ONLY from real
 * web-search provenance (`web_search_call.action.sources` + `url_citation`
 * annotations — never URLs written into the model's `output_text`) and validates
 * each via `safeOriginFromUrl` (rejecting credentials, unsupported protocols,
 * localhost and IP literals, and reducing every URL to origin + hostname only).
 *
 * On top of that, it keeps ONLY sources whose hostname is the target host or its
 * exact `www.` counterpart — arbitrary subdomains are rejected. This is the real
 * guard: the OpenAI `allowed_domains` filter also permits subdomains, so the
 * backend must re-check every source even when the filter is configured.
 *
 * The returned values are origin-only (scheme + host), deduplicated and sorted.
 * No path, query, fragment, title, snippet, page content or model-returned URL
 * ever survives.
 */
export function extractConfirmationEvidence(response: unknown, targetDomain: string): string[] {
  const sources = extractWebSearchSources(response);

  const origins = new Set<string>();
  for (const source of sources) {
    if (!isTargetHost(source.hostname, targetDomain)) continue;
    origins.add(source.origin);
  }
  return [...origins].sort();
}
