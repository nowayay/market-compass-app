import { nameMatchScore } from "./normalizeCompanyName.ts";
import type {
  IdentificationDecision,
  MatchStrength,
  ScoredCandidate,
  VerifiedCandidate,
} from "./types.ts";
import type { NormalizedQuery } from "../types.ts";

/**
 * Deterministic candidate scoring and decision.
 *
 * The AI never decides the final company and never supplies confidence. Given
 * KRS-verified candidates, the user's query, and the number of INDEPENDENT
 * web-search source hostnames, this computes an explicit, testable confidence
 * from fixed rules — no randomness and no reliance on search result order.
 *
 * Confidence derives ONLY from:
 *  - KRS confirmation (a fixed base),
 *  - deterministic name match,
 *  - the count of independent web-search sources (by unique hostname).
 *
 * There is deliberately NO founded-year bonus and NO website/domain bonus in
 * this stage (KRS registration date is not a founding date, and a single web
 * result cannot establish an official domain). Sources are a response-level
 * corroboration signal — they are not attributed to individual candidates.
 */

/** Name-match threshold for a "strong" match. */
export const STRONG_NAME_THRESHOLD = 0.6;

const KRS_VERIFIED_BASE = 0.35;
const NAME_WEIGHT = 0.6; // exact name → 0.95 before source bonus
const SOURCE_BONUS_PER_EXTRA_HOST = 0.02;
const SOURCE_BONUS_CAP = 0.04;
const MAX_CONFIDENCE = 0.99;

export function strengthFor(score: number): MatchStrength {
  if (score >= 1) return "exact";
  if (score >= STRONG_NAME_THRESHOLD) return "strong";
  return "weak";
}

/** Small, capped bonus for independent sources (≥ 2 distinct hostnames). */
function sourceBonus(distinctSourceHostnames: number): number {
  if (distinctSourceHostnames < 2) return 0;
  return Math.min(SOURCE_BONUS_CAP, (distinctSourceHostnames - 1) * SOURCE_BONUS_PER_EXTRA_HOST);
}

/** Scores a single verified candidate. Pure. */
export function scoreCandidate(
  query: NormalizedQuery,
  candidate: VerifiedCandidate,
  distinctSourceHostnames: number,
): ScoredCandidate {
  const score = nameMatchScore(query.name, candidate.krsCompany.legalName);
  const strength = strengthFor(score);

  const confidence = Math.min(
    MAX_CONFIDENCE,
    Number((KRS_VERIFIED_BASE + score * NAME_WEIGHT + sourceBonus(distinctSourceHostnames)).toFixed(2)),
  );

  const matchReasons: string[] = ["Numer KRS potwierdzony w oficjalnym rejestrze"];
  if (strength === "exact") matchReasons.push("Dokładna zgodność nazwy");
  else if (strength === "strong") matchReasons.push("Silna zgodność nazwy");
  else matchReasons.push("Częściowa zgodność nazwy");
  if (distinctSourceHostnames >= 2) {
    matchReasons.push("Potwierdzenie w niezależnych źródłach internetowych");
  }

  return { krsCompany: candidate.krsCompany, discovered: candidate.discovered, strength, confidence, matchReasons };
}

/** Scores every verified candidate against the same global source signal. */
export function scoreCandidates(
  query: NormalizedQuery,
  candidates: VerifiedCandidate[],
  distinctSourceHostnames: number,
): ScoredCandidate[] {
  return candidates.map((c) => scoreCandidate(query, c, distinctSourceHostnames));
}

/**
 * Deterministic decision:
 * - 0 candidates → not_found,
 * - exactly 1 with exact/strong name match → completed,
 * - exactly 1 with a weak match → needs_confirmation,
 * - 2+ verified candidates → needs_confirmation.
 */
export function decideIdentification(scored: ScoredCandidate[]): IdentificationDecision {
  if (scored.length === 0) return "not_found";
  if (scored.length === 1) {
    return scored[0].strength === "weak" ? "needs_confirmation" : "completed";
  }
  return "needs_confirmation";
}
