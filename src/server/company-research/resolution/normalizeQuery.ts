import type { CompanyResearchRequest } from "../schema";
import type { NormalizedQuery } from "../types";

/**
 * Normalizes a KRS number to exactly 10 digits, or returns `null` when the
 * input cannot be a valid KRS.
 *
 * KRS numbers are up to 10 digits and are frequently written without their
 * leading zeros (and sometimes with spaces or dashes). We strip separators,
 * require the remainder to be all digits, and left-pad to 10. Anything with
 * non-digit characters or more than 10 digits is rejected.
 */
export function normalizeKrs(raw: string): string | null {
  const stripped = raw.replace(/[\s-]/g, "");
  if (stripped.length === 0) return null;
  if (!/^[0-9]+$/.test(stripped)) return null;
  if (stripped.length > 10) return null;
  return stripped.padStart(10, "0");
}

/**
 * Turns a validated request into a fully normalized query. Throws only via the
 * caller's KRS handling — here an unnormalizable KRS surfaces as `krs: null` in
 * the returned tuple so the caller can raise the specific INVALID_KRS error.
 */
export function normalizeQuery(
  request: CompanyResearchRequest,
): { query: NormalizedQuery; krsInvalid: boolean } {
  const { query, selectedCandidateId } = request;

  let krs: string | undefined;
  let krsInvalid = false;
  if (query.krs !== undefined) {
    const normalized = normalizeKrs(query.krs);
    if (normalized === null) {
      krsInvalid = true;
    } else {
      krs = normalized;
    }
  }

  const normalizedQuery: NormalizedQuery = {
    name: query.name.trim(),
    countryCode: query.countryCode,
    foundedYear: query.foundedYear,
    krs,
    selectedCandidateId: selectedCandidateId ?? undefined,
  };

  return { query: normalizedQuery, krsInvalid };
}
