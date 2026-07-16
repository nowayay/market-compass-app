/**
 * Strict internal enums for internal Official Domain RESOLUTION.
 *
 * Resolution chains discovery → deterministic evaluation → independent
 * confirmation into one internal verdict. These codes carry NO company names,
 * URLs or raw values, and are NOT part of the public Company Research contract.
 *
 * There is deliberately NO generic `CONFIRMATION_SKIPPED` reason: the specific
 * reason confirmation did not run is always one of NO_DISCOVERY_CANDIDATES,
 * NO_PROBABLE_CANDIDATE or MULTIPLE_PROBABLE_CANDIDATES.
 */

/** Reasons attached to a resolution result. */
export type DomainResolutionReasonCode =
  | "NO_DISCOVERY_CANDIDATES"
  | "NO_PROBABLE_CANDIDATE"
  | "MULTIPLE_PROBABLE_CANDIDATES"
  | "CONFIRMATION_CONFIRMED"
  | "CONFIRMATION_CONFLICT"
  | "CONFIRMATION_UNVERIFIED";

/** Canonical ordering so a result's `reasons` array is fully deterministic. */
export const RESOLUTION_REASON_ORDER: readonly DomainResolutionReasonCode[] = [
  "NO_DISCOVERY_CANDIDATES",
  "NO_PROBABLE_CANDIDATE",
  "MULTIPLE_PROBABLE_CANDIDATES",
  "CONFIRMATION_CONFIRMED",
  "CONFIRMATION_CONFLICT",
  "CONFIRMATION_UNVERIFIED",
];

/** Deterministically orders + de-duplicates a set of resolution reasons. */
export function orderResolutionReasons(
  reasons: Iterable<DomainResolutionReasonCode>,
): DomainResolutionReasonCode[] {
  const set = new Set(reasons);
  return RESOLUTION_REASON_ORDER.filter((r) => set.has(r));
}
