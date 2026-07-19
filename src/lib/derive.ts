// Pure helpers that turn a ranked country / dashboard result into display-ready
// data (tier labels/colors, map fill, a bounded chat context string).
import type { DashboardCompletedResponse, DecoratedCountry, RankedCountry } from "../types";

export function tierOf(score: number) {
  if (score >= 78) return { label: "Bardzo wysoki", color: "#16A34A", bg: "#DCFCE7" };
  if (score >= 62) return { label: "Wysoki", color: "#4D9E1F", bg: "#ECFCCB" };
  if (score >= 45) return { label: "Średni", color: "#D97706", bg: "#FEF3C7" };
  return { label: "Bardzo niski", color: "#DC2626", bg: "#FEE2E2" };
}

export function mapFillOf(score: number) {
  if (score >= 78) return "#16A34A";
  if (score >= 62) return "#7CB342";
  if (score >= 45) return "#F59E0B";
  return "#EF4444";
}

/** Decorates one AI-ranked country with its display rank + tier colors. */
export function decorateCountry(country: RankedCountry, index: number): DecoratedCountry {
  const t = tierOf(country.score);
  return {
    ...country,
    rank: index + 1,
    tierLabel: t.label,
    tierColor: t.color,
    tierBg: t.bg,
    mapFill: mapFillOf(country.score),
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
