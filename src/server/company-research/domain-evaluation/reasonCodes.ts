/**
 * Strict internal enums for deterministic domain candidate EVALUATION.
 *
 * This module evaluates DISCOVERY candidates; it does NOT confirm official-domain
 * ownership. Model-returned identifiers (matchedKrs/Nip/Regon) are untrusted
 * discovery signals — a match may be a mere echo of the input and does not prove
 * the identifier appeared on the discovered page. Reason names reflect this
 * ("…_DISCOVERY_SIGNAL_MATCH", never "verified/attested/confirmed").
 *
 * Codes carry NO company names, URLs or raw values, and are NOT part of the
 * public Company Research contract.
 */

/** Positive / informational reasons attached to a candidate or the overall result. */
export type DomainEvaluationReasonCode =
  | "KRS_DISCOVERY_SIGNAL_MATCH"
  | "NIP_DISCOVERY_SIGNAL_MATCH"
  | "REGON_DISCOVERY_SIGNAL_MATCH"
  | "LEGAL_NAME_EXACT_MATCH"
  | "LEGAL_NAME_STRONG_MATCH"
  | "CITY_MATCH"
  | "DOMAIN_TOKEN_MATCH"
  | "IDENTIFIER_MATCH_MISSING"
  | "INSUFFICIENT_SIGNALS"
  | "MULTIPLE_PROBABLE_CANDIDATES";

/** Hard conflicts. Any conflict rejects a candidate (never offset by other signals). */
export type DomainEvaluationConflictCode =
  | "KRS_CONFLICT"
  | "NIP_CONFLICT"
  | "REGON_CONFLICT"
  | "MALFORMED_KRS_SIGNAL"
  | "MALFORMED_NIP_SIGNAL"
  | "MALFORMED_REGON_SIGNAL";

/** Canonical ordering so a candidate's `reasons` array is fully deterministic. */
export const REASON_ORDER: readonly DomainEvaluationReasonCode[] = [
  "KRS_DISCOVERY_SIGNAL_MATCH",
  "NIP_DISCOVERY_SIGNAL_MATCH",
  "REGON_DISCOVERY_SIGNAL_MATCH",
  "LEGAL_NAME_EXACT_MATCH",
  "LEGAL_NAME_STRONG_MATCH",
  "CITY_MATCH",
  "DOMAIN_TOKEN_MATCH",
  "IDENTIFIER_MATCH_MISSING",
  "INSUFFICIENT_SIGNALS",
];

/** Canonical ordering so a candidate's `conflicts` array is fully deterministic. */
export const CONFLICT_ORDER: readonly DomainEvaluationConflictCode[] = [
  "KRS_CONFLICT",
  "NIP_CONFLICT",
  "REGON_CONFLICT",
  "MALFORMED_KRS_SIGNAL",
  "MALFORMED_NIP_SIGNAL",
  "MALFORMED_REGON_SIGNAL",
];
