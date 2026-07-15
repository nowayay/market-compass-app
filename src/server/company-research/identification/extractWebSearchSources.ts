import { safeOriginFromUrl } from "./webSourceSecurity.ts";
import type { SafeDiscoveredSource } from "./webSourceSecurity.ts";

/**
 * Extracts REAL web-search sources from a Responses API result.
 *
 * Sources come only from provider-attested provenance:
 * - `web_search_call` output items → `action.sources[].url`,
 * - `message` output items → `url_citation` annotations.
 * `action.url` (a single open_page/find target) is NOT a source, and URLs
 * written into `output_text` by the model are NEVER treated as sources.
 *
 * Works on `unknown` with a strict allowlist, ignores unknown output items,
 * validates every URL, deduplicates by origin, and copies no page content,
 * snippet, title or search query.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Collect candidate URLs from a single output item, by its declared type. */
function urlsFromItem(item: unknown): string[] {
  const record = asRecord(item);
  if (!record) return [];
  const urls: string[] = [];

  if (record.type === "web_search_call") {
    const action = asRecord(record.action);
    if (action) {
      // Only the attested search sources — never action.url (a single
      // open_page/find target is not a provenance source).
      for (const source of asArray(action.sources)) {
        const src = asRecord(source);
        if (src && typeof src.url === "string") urls.push(src.url);
      }
    }
    return urls;
  }

  if (record.type === "message") {
    for (const part of asArray(record.content)) {
      const content = asRecord(part);
      if (!content || content.type !== "output_text") continue;
      for (const annotation of asArray(content.annotations)) {
        const ann = asRecord(annotation);
        if (ann && ann.type === "url_citation" && typeof ann.url === "string") {
          urls.push(ann.url);
        }
      }
    }
  }

  return urls;
}

export function extractWebSearchSources(response: unknown): SafeDiscoveredSource[] {
  const record = asRecord(response);
  const output = record ? asArray(record.output) : [];

  const byOrigin = new Map<string, SafeDiscoveredSource>();
  for (const item of output) {
    for (const url of urlsFromItem(item)) {
      const safe = safeOriginFromUrl(url);
      if (safe && !byOrigin.has(safe.origin)) {
        byOrigin.set(safe.origin, safe);
      }
    }
  }
  return [...byOrigin.values()];
}
