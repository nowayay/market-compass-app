/**
 * Deterministic company-description construction (pure, dependency-light).
 *
 * The description is built ONLY by application code from already-accepted profile
 * facts — never by a model. It carries no identifiers, addresses, people, contact
 * data, recommendations, SWOT, provider ambiguity codes or source URLs; it uses
 * fixed templates, a stable clause order, bounded lists and a hard length limit,
 * and it is truncated only at sentence (clause) boundaries.
 *
 * Grammar note: every connector is either a noun label or a present-tense 3rd-
 * person verb, both of which are gender-neutral in Polish — so the description
 * never has to guess a company's gender or natural-person identity. An official
 * legal name that happens to contain a person's name is used verbatim as the
 * company's legal name (the only person-like value permitted here).
 */
import { canonicalKey, normalizeText } from "../business-research/normalizeBusinessFacts.ts";
import type { StructuredBusinessFacts } from "../business-research/types.ts";

/** Prose list caps (see the assembly spec). Excess values are never claimed exhaustive. */
export const DESCRIPTION_PRODUCTS_SHOWN = 3;
export const DESCRIPTION_SEGMENTS_SHOWN = 2;
export const DESCRIPTION_MARKETS_SHOWN = 3;

/**
 * Conservative internal maximum length (the `CompanyBusiness.description` contract
 * defines no maximum). Truncation only ever drops whole trailing clauses, so the
 * result always ends on a sentence boundary.
 */
export const DESCRIPTION_MAX_LENGTH = 600;

/** A single built clause plus the accepted display values it actually rendered. */
type ClauseKind = "identity" | "products" | "segments" | "markets";
interface Clause {
  kind: ClauseKind;
  text: string;
  /** Display values rendered by this clause (empty for the identity clause). */
  shown: string[];
}

/**
 * The deterministic description build. `text` is null when there is not enough
 * accepted information for an honest, useful description. `used*` reflect exactly
 * what survived length truncation, so evidence can reference only the material
 * facts that actually appear.
 */
export interface DescriptionBuild {
  text: string | null;
  usedLegalName: boolean;
  usedIndustry: boolean;
  usedProducts: string[];
  usedSegments: string[];
  usedMarkets: string[];
}

/** Case-insensitively de-duplicates values, preserving the first display spelling. */
function dedupe(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeText(raw);
    if (value.length === 0) continue;
    const key = canonicalKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** Valid terminal sentence marks. */
const TERMINAL_MARKS = new Set([".", "!", "?"]);
/** Supported trailing closing punctuation (straight/typographic quotes, brackets). */
const CLOSING_MARKS = new Set(['"', "'", "”", "’", "»", ")", "]"]);

/**
 * Terminates a clause with exactly one valid sentence terminator. Legal names and
 * clauses may already end in `.`/`!`/`?` (optionally wrapped in closing quotes or
 * brackets, e.g. `Nazwa"`, `(Nazwa)`), so a naive period append would produce
 * `Nazwa!.` or `Nazwa".`. Rules:
 *  - already ends in a terminal mark → unchanged,
 *  - ends in a run of closing marks preceded by a terminal mark → unchanged,
 *  - ends in a run of closing marks with no preceding terminal mark → insert a
 *    single period immediately before that closing run (keeps the terminator
 *    inside the closing punctuation, matching the `."`/`.)` convention),
 *  - otherwise → append a single period.
 */
function terminate(text: string): string {
  if (text.length === 0) return text;
  const last = text[text.length - 1];
  if (TERMINAL_MARKS.has(last)) return text;

  // Find the start of the trailing run of closing marks.
  let i = text.length;
  while (i > 0 && CLOSING_MARKS.has(text[i - 1])) i--;
  if (i < text.length) {
    const beforeRun = i > 0 ? text[i - 1] : "";
    if (TERMINAL_MARKS.has(beforeRun)) return text; // already terminated inside closers
    return `${text.slice(0, i)}.${text.slice(i)}`;
  }
  return `${text}.`;
}

/** Renders up to `max` values; appends "i inne" when more exist (never exhaustive). */
function proseList(values: readonly string[], max: number): { text: string; shown: string[] } {
  const shown = values.slice(0, max);
  const base = shown.join(", ");
  return { text: values.length > max ? `${base} i inne` : base, shown };
}

const EMPTY: DescriptionBuild = {
  text: null,
  usedLegalName: false,
  usedIndustry: false,
  usedProducts: [],
  usedSegments: [],
  usedMarkets: [],
};

/**
 * Builds the deterministic description from the legal name and the accepted
 * business facts. Returns an absent (`text: null`) build when there is not enough
 * accepted business information — the legal name alone is never enough.
 *
 * Clause order is fixed: identity/industry → products/services → customer
 * segments → operating markets. Clauses are appended while they fit within the
 * length limit; the first clause that would overflow (and every clause after it)
 * is dropped, so the result always ends on a sentence boundary.
 */
export function buildCompanyDescription(
  legalName: string,
  facts: StructuredBusinessFacts,
): DescriptionBuild {
  const name = normalizeText(legalName);
  const industry = facts.industryDescription === null ? null : normalizeText(facts.industryDescription);
  const products = dedupe(facts.productsServices);
  const segments = dedupe(facts.customerSegments);
  const markets = dedupe(facts.operatingMarkets);

  const industryText = industry !== null && industry.length > 0 ? industry : null;
  const hasBusinessFact =
    industryText !== null || products.length > 0 || segments.length > 0 || markets.length > 0;

  // Rule 12: with no accepted business information there is nothing honest and
  // useful to say beyond the legal name, so omit the description entirely.
  if (name.length === 0 || !hasBusinessFact) return { ...EMPTY };

  const clauses: Clause[] = [];
  // Identity/industry clause (always the first sentence). No verb → no gendered
  // agreement; an em dash separates the legal name from the industry summary.
  clauses.push({
    kind: "identity",
    text: industryText !== null ? `${name} - ${industryText}` : name,
    shown: [],
  });
  if (products.length > 0) {
    const { text, shown } = proseList(products, DESCRIPTION_PRODUCTS_SHOWN);
    clauses.push({ kind: "products", text: `Produkty i usługi: ${text}`, shown });
  }
  if (segments.length > 0) {
    const { text, shown } = proseList(segments, DESCRIPTION_SEGMENTS_SHOWN);
    clauses.push({ kind: "segments", text: `Klienci: ${text}`, shown });
  }
  if (markets.length > 0) {
    const { text, shown } = proseList(markets, DESCRIPTION_MARKETS_SHOWN);
    clauses.push({ kind: "markets", text: `Rynki działalności: ${text}`, shown });
  }

  // Hard length boundary at clause boundaries: keep whole sentences only, never a
  // character-truncated clause. If the very first (identity/industry) clause alone
  // exceeds the limit, the whole description is omitted rather than shortened.
  const kept: Clause[] = [];
  let length = 0;
  for (const clause of clauses) {
    const piece = terminate(clause.text);
    const added = (kept.length > 0 ? 1 : 0) + piece.length; // +1 for the joining space
    if (length + added > DESCRIPTION_MAX_LENGTH) {
      if (kept.length === 0) return { ...EMPTY }; // identity clause alone too long
      break;
    }
    kept.push(clause);
    length += added;
  }

  const text = kept.map((c) => terminate(c.text)).join(" ");
  const productsClause = kept.find((c) => c.kind === "products");
  const segmentsClause = kept.find((c) => c.kind === "segments");
  const marketsClause = kept.find((c) => c.kind === "markets");

  return {
    text,
    usedLegalName: true,
    usedIndustry: industryText !== null,
    usedProducts: productsClause?.shown ?? [],
    usedSegments: segmentsClause?.shown ?? [],
    usedMarkets: marketsClause?.shown ?? [],
  };
}
