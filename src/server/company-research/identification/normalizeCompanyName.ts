/**
 * Deterministic company-name normalization and matching.
 *
 * Pure and dependency-free so it is trivially testable and usable anywhere. It
 * folds Polish diacritics, strips legal-form/connective tokens and punctuation,
 * and compares by token overlap. A legal name may legitimately contain a
 * person's surname (as part of the company name) — we treat it purely as company
 * text, never as a person profile.
 */

/** Legal-form and connective tokens that carry no identifying signal. */
const LEGAL_TOKENS = new Set([
  "sp",
  "s",
  "a",
  "z",
  "o",
  "oo",
  "zoo",
  "spzoo",
  "spolka",
  "spolki",
  "akcyjna",
  "akcyjnej",
  "sa",
  "komandytowa",
  "komandytowo",
  "jawna",
  "cywilna",
  "spk",
  "spj",
  "sk",
  "ograniczona",
  "ograniczoną",
  "odpowiedzialnoscia",
  "przedsiebiorstwo",
  "przedsiebiorstwa",
  "firma",
  "the",
  "and",
  "i",
  "oraz",
  "group",
  "grupa",
]);

/** Folds Polish diacritics to ASCII (input should already be lower-cased). */
function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

/** Returns the normalized name string (space-joined significant tokens). */
export function normalizeCompanyName(raw: string): string {
  return companyNameTokens(raw).join(" ");
}

/** Returns the significant, normalized tokens of a company name. */
export function companyNameTokens(raw: string): string[] {
  return foldDiacritics(raw.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !LEGAL_TOKENS.has(token));
}

/**
 * A deterministic 0..1 name-match score: 1 for an exact normalized match,
 * otherwise the Jaccard overlap of the significant token sets.
 */
export function nameMatchScore(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (na.length === 0 || nb.length === 0) return 0;
  if (na === nb) return 1;

  const setA = new Set(na.split(" "));
  const setB = new Set(nb.split(" "));
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : Number((intersection / union).toFixed(4));
}
