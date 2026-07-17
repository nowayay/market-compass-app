/**
 * Strict internal enums for internal Structured Business Research.
 *
 * Codes carry NO company names, URLs, facts or raw values, and are NOT part of
 * the public Company Research contract. Reasons are informational/positive or
 * status-explaining; conflicts are scope/contradiction signals derived from the
 * model's `ambiguityCodes` (never free text).
 */

/** Reasons attached to a business-research result. */
export type BusinessResearchReasonCode =
  | "DOMAIN_NOT_CONFIRMED"
  | "MULTIPLE_BUSINESS_ACTIVITIES"
  | "INSUFFICIENT_BUSINESS_EVIDENCE"
  | "NO_ATTESTED_SOURCES"
  | "ENTITY_SCOPE_AMBIGUITY";

/** Scope/contradiction conflicts derived deterministically from ambiguity codes. */
export type BusinessResearchConflictCode =
  | "MULTIPLE_LEGAL_ENTITIES"
  | "GROUP_SCOPE_UNCLEAR"
  | "SUBSIDIARY_SCOPE_UNCLEAR"
  | "THIRD_PARTY_LISTING_SCOPE"
  | "CONTRADICTORY_ACTIVITIES"
  | "CONTRADICTORY_OFFERINGS"
  | "CONTRADICTORY_CUSTOMER_SEGMENTS"
  | "CONTRADICTORY_MARKETS";

/** Canonical ordering so a result's `reasons` array is fully deterministic. */
export const BUSINESS_REASON_ORDER: readonly BusinessResearchReasonCode[] = [
  "DOMAIN_NOT_CONFIRMED",
  "ENTITY_SCOPE_AMBIGUITY",
  "MULTIPLE_BUSINESS_ACTIVITIES",
  "INSUFFICIENT_BUSINESS_EVIDENCE",
  "NO_ATTESTED_SOURCES",
];

/** Canonical ordering so a result's `conflicts` array is fully deterministic. */
export const BUSINESS_CONFLICT_ORDER: readonly BusinessResearchConflictCode[] = [
  "MULTIPLE_LEGAL_ENTITIES",
  "GROUP_SCOPE_UNCLEAR",
  "SUBSIDIARY_SCOPE_UNCLEAR",
  "THIRD_PARTY_LISTING_SCOPE",
  "CONTRADICTORY_ACTIVITIES",
  "CONTRADICTORY_OFFERINGS",
  "CONTRADICTORY_CUSTOMER_SEGMENTS",
  "CONTRADICTORY_MARKETS",
];

/** Deterministically orders + de-duplicates a set of reasons. */
export function orderBusinessReasons(
  reasons: Iterable<BusinessResearchReasonCode>,
): BusinessResearchReasonCode[] {
  const set = new Set(reasons);
  return BUSINESS_REASON_ORDER.filter((r) => set.has(r));
}

/** Deterministically orders + de-duplicates a set of conflicts. */
export function orderBusinessConflicts(
  conflicts: Iterable<BusinessResearchConflictCode>,
): BusinessResearchConflictCode[] {
  const set = new Set(conflicts);
  return BUSINESS_CONFLICT_ORDER.filter((c) => set.has(c));
}
