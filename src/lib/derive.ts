// Pure helpers that turn a ranked country / dashboard result into display-ready
// data (tier labels/colors, map fill, a bounded chat context string).
import type { DashboardCompletedResponse, DecoratedCountry, RankedCountry } from "../types";

/**
 * Tier for a country's 1-based rank position within the 15-country ranking:
 * places 1-5 (best fit), 6-10 (medium fit), 11-15 (lowest fit). The ranking
 * list, map fill and map legend all derive their color from this grouping.
 */
export function tierOf(rank: number) {
  if (rank <= 5) return { label: "Wysoki potencjał", color: "#16A34A", bg: "#DCFCE7" };
  if (rank <= 10) return { label: "Średni potencjał", color: "#F59E0B", bg: "#FEF3C7" };
  return { label: "Niski potencjał", color: "#EF4444", bg: "#FEE2E2" };
}

export function mapFillOf(rank: number) {
  if (rank <= 5) return "#16A34A";
  if (rank <= 10) return "#F59E0B";
  return "#EF4444";
}

/** Decorates one AI-ranked country with its display rank + rank-based tier colors. */
export function decorateCountry(country: RankedCountry, index: number): DecoratedCountry {
  const rank = index + 1;
  const t = tierOf(rank);
  return {
    ...country,
    rank,
    tierLabel: t.label,
    tierColor: t.color,
    tierBg: t.bg,
    mapFill: mapFillOf(rank),
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
