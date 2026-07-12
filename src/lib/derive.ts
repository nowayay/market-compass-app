// Pure helpers that turn raw scoreCountry() results into display-ready data
// (tier labels/colors, map fill, ranking stars/dots). Mirrors the design
// prototype's renderVals() decoration logic.

import type { DecoratedResult, ScoredResult, Swot, SwotCat } from "../types";

export function tierOf(score: number) {
  if (score >= 78) return { label: 'Bardzo wysoki', color: '#16A34A', bg: '#DCFCE7' };
  if (score >= 62) return { label: 'Wysoki', color: '#4D9E1F', bg: '#ECFCCB' };
  if (score >= 45) return { label: 'Średni', color: '#D97706', bg: '#FEF3C7' };
  return { label: 'Bardzo niski', color: '#DC2626', bg: '#FEE2E2' };
}

export function mapFillOf(score: number) {
  if (score >= 78) return '#16A34A';
  if (score >= 62) return '#7CB342';
  if (score >= 45) return '#F59E0B';
  return '#EF4444';
}

const riskShortMap: Record<string, { label: string; bg: string; color: string }> = {
  Niskie: { label: 'Niskie', bg: '#DCFCE7', color: '#15803D' },
  Średnie: { label: 'Średnie', bg: '#FEF3C7', color: '#B45309' },
  Wysokie: { label: 'Wysokie', bg: '#FEE2E2', color: '#DC2626' },
};

export function decorateResult(r: ScoredResult, onOpen: (id: string) => void): DecoratedResult {
  const t = tierOf(r.score);
  const rk = riskShortMap[r.risk] || { label: '—', bg: '#F3F4F6', color: '#6B7280' };
  const nStars = Math.max(0, Math.min(5, Math.round(r.marketPotential / 20)));
  const nDots = Math.max(0, Math.min(5, Math.round(r.profitability / 20)));
  const stars = Array.from({ length: 5 }, (_, i) => ({ ch: i < nStars ? '★' : '☆', col: i < nStars ? '#16A34A' : '#D1D5DB' }));
  const dots = Array.from({ length: 5 }, (_, i) => ({ ch: i < nDots ? '●' : '○', col: i < nDots ? '#16A34A' : '#D1D5DB' }));
  return {
    id: r.country.id, name: r.country.name, country: r.country,
    score: r.score, band: r.band, risk: r.risk,
    marketPotential: r.marketPotential, profitability: r.profitability, fit: r.fit,
    investmentLevel: r.investmentLevel, investmentRange: r.investmentRange,
    strategy: r.strategy, pros: r.pros, cons: r.cons, risks: r.risks, justification: r.justification,
    tierLabel: t.label, tierColor: t.color, tierBg: t.bg, mapFill: mapFillOf(r.score),
    riskShort: rk.label, riskBg: rk.bg, riskColor: rk.color,
    stars, dots,
    markerSize: r.band === 'recommended' ? 16 : r.band === 'medium' ? 13 : 11,
    ringGradient: `conic-gradient(${mapFillOf(r.score)} ${r.score}%, #EBECEF 0)`,
    onOpen: () => onOpen(r.country.id),
  };
}

export const SWOT_META: Record<keyof Swot, { letter: string; label: string; color: string }> = {
  strengths: { letter: 'S', label: 'Strengths', color: '#16A34A' },
  weaknesses: { letter: 'W', label: 'Weaknesses', color: '#F59E0B' },
  opportunities: { letter: 'O', label: 'Opportunities', color: '#16A34A' },
  threats: { letter: 'T', label: 'Threats', color: '#EF4444' },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  Wysoki: { bg: '#FEE2E2', color: '#DC2626' },
  Średni: { bg: '#FEF3C7', color: '#B45309' },
  Niski: { bg: '#DCFCE7', color: '#15803D' },
};

export function buildSwotCats(swot: Swot | null): SwotCat[] {
  if (!swot) return [];
  return (Object.keys(SWOT_META) as (keyof Swot)[]).map((k) => {
    const items = swot[k];
    const pc = PRIORITY_COLORS[items[0].priority] || { bg: '#F3F4F6', color: '#6B7280' };
    return {
      key: k,
      ...SWOT_META[k],
      bullets: items.map((it) => it.title),
      priority: items[0].priority,
      prioBg: pc.bg,
      prioColor: pc.color,
      actions: items[0].actions,
    };
  });
}
