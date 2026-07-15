/**
 * Stable, deterministic candidate identifiers.
 *
 * Format: `cmp_pl_krs_<10 digits>` (e.g. `cmp_pl_krs_0000123456`).
 * - Only Poland (`pl`) is supported in this stage; any other country code, any
 *   uppercase, extra prefix/suffix, or a non-10-digit KRS is rejected.
 * - Derived only from the public KRS number, never from array order, and
 *   resolvable without any server-side cache.
 * - NOT a security token — it carries no authorization meaning.
 * Pure and dependency-free.
 */

const CANDIDATE_ID_PATTERN = /^cmp_pl_krs_(\d{10})$/;

export interface CandidateIdParts {
  countryCode: "PL";
  krs: string;
}

/** Builds a candidate id from a 10-digit KRS (Poland only). */
export function createCandidateId(krs: string): string {
  return `cmp_pl_krs_${krs}`;
}

/** Parses/validates a Polish candidate id, returning its parts or null. */
export function parseCandidateId(candidateId: string): CandidateIdParts | null {
  const match = CANDIDATE_ID_PATTERN.exec(candidateId);
  if (!match) return null;
  return { countryCode: "PL", krs: match[1] };
}

/** True when the string is a well-formed Polish candidate id. */
export function isValidCandidateId(candidateId: string): boolean {
  return CANDIDATE_ID_PATTERN.test(candidateId);
}
