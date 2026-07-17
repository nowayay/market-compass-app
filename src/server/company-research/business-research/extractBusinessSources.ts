import { extractWebSearchSources } from "../identification/extractWebSearchSources.ts";
import { isTargetHost } from "../domain-confirmation/targetHosts.ts";

/**
 * Extracts on-target-domain, provider-attested source ORIGINS from a Responses
 * API result of the CURRENT business-research call only.
 *
 * It reuses `extractWebSearchSources`, which takes sources ONLY from real
 * web-search provenance (`web_search_call.action.sources` + `url_citation`
 * annotations — never URLs written into the model's `output_text`) and validates
 * each via `safeOriginFromUrl` (rejecting credentials, unsupported protocols,
 * localhost, IP literals; reducing every URL to origin + hostname only).
 *
 * On top of that it keeps ONLY sources whose hostname is the target host or its
 * exact `www.` counterpart — arbitrary subdomains are rejected. No prior
 * discovery/evaluation/confirmation source can enter here (this reads only the
 * current response). Returned values are origin-only, de-duplicated and sorted.
 */
export function extractBusinessSources(response: unknown, targetDomain: string): string[] {
  const sources = extractWebSearchSources(response);
  const origins = new Set<string>();
  for (const source of sources) {
    if (!isTargetHost(source.hostname, targetDomain)) continue;
    origins.add(source.origin);
  }
  return [...origins].sort();
}
