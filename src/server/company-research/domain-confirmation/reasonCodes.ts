/**
 * Strict internal enums for evidence-backed official-domain CONFIRMATION.
 *
 * Unlike domain EVALUATION (whose reasons say "…_DISCOVERY_SIGNAL_MATCH" because
 * a model-returned identifier may be an echo of our own input), confirmation
 * withholds the expected identifiers, so a match here is INDEPENDENT — hence
 * "…_IDENTIFIER_VERIFIED".
 *
 * Codes carry NO company names, URLs or raw values, and are NOT part of the
 * public Company Research contract.
 */

/** Positive / informational reasons attached to a confirmation result. */
export type DomainConfirmationReasonCode =
  | "KRS_IDENTIFIER_VERIFIED"
  | "NIP_IDENTIFIER_VERIFIED"
  | "REGON_IDENTIFIER_VERIFIED"
  | "MALFORMED_KRS_VALUE"
  | "MALFORMED_NIP_VALUE"
  | "MALFORMED_REGON_VALUE"
  | "NO_INDEPENDENT_IDENTIFIER"
  | "NO_ATTESTED_SOURCE"
  | "CONFIRMATION_UNAVAILABLE";

/**
 * Hard conflicts. A conflict means a VALID (well-formed) independently-found
 * identifier differs from the corresponding expected company identifier. A
 * conflict always wins, even when another identifier matches.
 */
export type DomainConfirmationConflictCode =
  | "KRS_CONFLICT"
  | "NIP_CONFLICT"
  | "REGON_CONFLICT";

/** Canonical ordering so a result's `reasons` array is fully deterministic. */
export const CONFIRMATION_REASON_ORDER: readonly DomainConfirmationReasonCode[] = [
  "KRS_IDENTIFIER_VERIFIED",
  "NIP_IDENTIFIER_VERIFIED",
  "REGON_IDENTIFIER_VERIFIED",
  "MALFORMED_KRS_VALUE",
  "MALFORMED_NIP_VALUE",
  "MALFORMED_REGON_VALUE",
  "NO_INDEPENDENT_IDENTIFIER",
  "NO_ATTESTED_SOURCE",
  "CONFIRMATION_UNAVAILABLE",
];

/** Canonical ordering so a result's `conflicts` array is fully deterministic. */
export const CONFIRMATION_CONFLICT_ORDER: readonly DomainConfirmationConflictCode[] = [
  "KRS_CONFLICT",
  "NIP_CONFLICT",
  "REGON_CONFLICT",
];
