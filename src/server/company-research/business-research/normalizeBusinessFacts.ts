/**
 * Deterministic normalization for business facts (pure, dependency-free).
 *
 * NO semantic/embedding dedup, NO automatic translation, NO diacritic stripping
 * for dedup, NO ISO-code conversion, NO market inference from language/currency/
 * shipping selectors, NO customer-segment inference, NO third-party product
 * inference, NO brittle grammar/noun-phrase classification.
 */

/** NFKC, strip control/format chars, collapse internal whitespace, trim. */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * The case-insensitive dedup key: normalized text lower-cased. Diacritics are
 * PRESERVED (so `café` and `cafe` stay distinct); we never strip them for dedup.
 */
export function canonicalKey(value: string): string {
  return normalizeText(value).toLowerCase();
}

// A value that leaks a URL, or reads as advice / SWOT / a long paragraph, is a
// quality problem (not personal data): it is dropped from the list. Personal-data
// violations are handled separately and invalidate the whole result.
const URL_RE = /(https?:\/\/|www\.)/i;
const ADVICE_RE =
  /\b(we recommend|our recommendation|expansion recommendation|should (consider|expand|enter|invest)|swot|market attractiveness)\b/i;

/** True when a normalized value must be dropped for quality reasons. */
function isRejectableValue(value: string, maxLen: number): boolean {
  if (value.length === 0) return true;
  if (value.length > maxLen) return true; // re-enforced item length limit
  if (URL_RE.test(value)) return true;
  if (ADVICE_RE.test(value)) return true;
  return false;
}

/**
 * Normalizes a list: normalize each value, drop empty / over-limit / rejectable
 * values, deduplicate case-insensitively (preserving the first accepted display
 * spelling), then cap at `maxItems`.
 */
export function normalizeList(values: readonly string[], maxItems: number, maxLen: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeText(raw);
    if (isRejectableValue(value, maxLen)) continue;
    const key = canonicalKey(value);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Normalizes a scalar description; returns null when empty or over the limit. */
export function normalizeScalar(value: string | null, maxLen: number): string | null {
  if (value === null) return null;
  const normalized = normalizeText(value);
  if (isRejectableValue(normalized, maxLen)) return null;
  return normalized;
}
