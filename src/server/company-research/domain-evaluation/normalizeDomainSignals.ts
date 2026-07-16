import { normalizeKrs } from "../resolution/normalizeQuery.ts";
import { companyNameTokens } from "../identification/normalizeCompanyName.ts";

/**
 * Deterministic identifier + name/city/domain normalization for evaluation.
 *
 * Reuses the project's canonical utilities where possible:
 *  - `normalizeKrs` (strip spaces/dashes, digits only, <= 10, left-pad to 10),
 *  - `companyNameTokens` (fold diacritics, strip legal-form tokens, tokenize).
 *
 * A normalizer returns `null` when a NON-null raw value cannot be a valid
 * identifier — the caller treats that as a MALFORMED signal (fail-closed).
 * Arbitrary letters or punctuation are REJECTED (never stripped into a valid
 * identifier): only spaces and hyphens are allowed as separators (plus an
 * optional case-insensitive `PL` prefix for NIP).
 */

/** KRS → exactly 10 digits, or null. Reuses the canonical KRS normalizer. */
export function normalizeKrsValue(raw: string): string | null {
  // `normalizeKrs` allows only digits/spaces/hyphens; letters/punctuation → null.
  return normalizeKrs(raw);
}

/** NIP → exactly 10 digits. Optional case-insensitive `PL` prefix; then only
 * digits, spaces and hyphens. Anything else → null (malformed). */
export function normalizeNipValue(raw: string): string | null {
  const match = /^\s*(?:PL\s*)?([0-9\s-]+)\s*$/i.exec(raw);
  if (match === null) return null; // arbitrary letters / punctuation present
  const digits = match[1].replace(/[\s-]/g, "");
  return digits.length === 10 ? digits : null;
}

/** REGON → 9 or 14 digits. Only digits, spaces and hyphens; anything else → null. */
export function normalizeRegonValue(raw: string): string | null {
  const match = /^\s*([0-9\s-]+)\s*$/.exec(raw);
  if (match === null) return null; // arbitrary letters / punctuation present
  const digits = match[1].replace(/[\s-]/g, "");
  return digits.length === 9 || digits.length === 14 ? digits : null;
}

/** Lower-cases and folds Polish diacritics (length-agnostic), keeping ASCII only. */
function foldLower(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

/** Normalizes a city for equality comparison (folded, alphanumeric only). */
export function normalizeCityValue(city: string): string {
  return foldLower(city).replace(/[^a-z0-9]+/g, "");
}

/**
 * The comparable "core" of a hostname: strips a leading `www.`, drops the last
 * (public-suffix / TLD) label with a conservative last-label rule, then folds and
 * strips legal-form tokens via `companyNameTokens`, joined into one string.
 *
 * No public-suffix-list dependency (none in the repo) — the last-label rule is a
 * conservative first version. It never proves ownership; it is a weak signal only.
 */
export function domainCore(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const labels = host.split(".");
  const withoutTld = labels.length > 1 ? labels.slice(0, -1) : labels;
  return companyNameTokens(withoutTld.join(" ")).join("");
}

/**
 * Weak, deterministic domain-token signal: true when the hostname core and a
 * company name (or approved alias) core reasonably correspond. Never overrides an
 * identifier conflict and never proves ownership.
 */
export function domainTokenMatch(hostname: string, names: readonly string[]): boolean {
  const core = domainCore(hostname);
  if (core.length < 3) return false;

  for (const name of names) {
    const tokens = companyNameTokens(name);
    if (tokens.length === 0) continue;
    const concat = tokens.join("");
    if (concat.length < 3) continue;

    if (core.includes(concat) || concat.includes(core)) return true;
    // Order-independent: every significant token (>= 3 chars) is present.
    if (tokens.every((t) => t.length >= 3 && core.includes(t))) return true;
  }
  return false;
}
