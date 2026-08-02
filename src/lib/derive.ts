// Pure helpers that turn a ranked country / dashboard result into display-ready
// data (tier labels/colors, map fill, a bounded chat context string).
import type { DashboardCompletedResponse, DecoratedCountry, RankedCountry } from "../types";

/**
 * Tier for a country's 1-based rank position within the 15-country ranking:
 * places 1-5 (best fit), 6-10 (medium fit), 11-15 (lowest fit). The ranking
 * list, map fill and map legend all derive their color from this grouping.
 *
 * Each tier carries two values, and which one to use is a contrast decision,
 * not a taste one:
 *
 * - `fill` is the bright, saturated value. It is for large areas of color the
 *   eye reads as a region — the map's country shapes and the legend swatches
 *   that sample them. Large fills only need 3:1 against the page.
 * - `ink` is the darkened value of the same hue. It is for anything read as a
 *   glyph: tier labels, score numbers, the SWOT letter discs, and the thin arc
 *   of the score ring. Those need 4.5:1, which the bright fills cannot reach
 *   without stopping being green, amber and red.
 *
 * `bg` is the tint each ink is legible on, for chips and badges.
 */
export function tierOf(rank: number) {
  if (rank <= 5) return { label: "Wysoki potencjał", ink: "#15803D", fill: "#16A34A", bg: "#DCFCE7" };
  if (rank <= 10) return { label: "Średni potencjał", ink: "#B45309", fill: "#D97706", bg: "#FEF3C7" };
  return { label: "Niski potencjał", ink: "#B91C1C", fill: "#EF4444", bg: "#FEE2E2" };
}

/** The map's large-area fill for a rank. Derived from `tierOf` so the two can never disagree. */
export function mapFillOf(rank: number) {
  return tierOf(rank).fill;
}

/** Decorates one AI-ranked country with its display rank + rank-based tier colors. */
export function decorateCountry(country: RankedCountry, index: number): DecoratedCountry {
  const rank = index + 1;
  const t = tierOf(rank);
  return {
    ...country,
    rank,
    tierLabel: t.label,
    tierInk: t.ink,
    tierBg: t.bg,
    mapFill: t.fill,
  };
}

/** Maximum length of the bounded dashboard context sent to the chatbot. */
const MAX_CHAT_CONTEXT_CHARS = 4000;

/**
 * Builds a small, bounded JSON summary of the current dashboard (company
 * profile + expansion analysis) to send as OPTIONAL chat context. Carries no
 * more than what is already shown on the dashboard, and is capped in length —
 * the server treats it as untrusted reference data, never as instructions.
 */
export function buildChatCompanyContext(dashboard: DashboardCompletedResponse): string {
  const summary = {
    company: {
      legalName: dashboard.company.legalName,
      industry: dashboard.company.industry,
      description: dashboard.company.description,
      productsServices: dashboard.company.productsServices,
      customerSegments: dashboard.company.customerSegments,
      operatingMarkets: dashboard.company.operatingMarkets,
    },
    swot: dashboard.expansion.swot,
    rankedCountries: dashboard.expansion.rankedCountries.map((c) => ({
      countryName: c.countryName,
      countryCode: c.countryCode,
      score: c.score,
      summary: c.summary,
    })),
  };
  const json = JSON.stringify(summary);
  return json.length > MAX_CHAT_CONTEXT_CHARS ? json.slice(0, MAX_CHAT_CONTEXT_CHARS) : json;
}
