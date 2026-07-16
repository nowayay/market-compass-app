import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import {
  normalizeKrsValue,
  normalizeNipValue,
  normalizeRegonValue,
} from "../domain-evaluation/normalizeDomainSignals.ts";
import { isTargetHost } from "./targetHosts.ts";
import {
  CONFIRMATION_CONFLICT_ORDER,
  CONFIRMATION_REASON_ORDER,
} from "./reasonCodes.ts";
import type {
  DomainConfirmationConflictCode,
  DomainConfirmationReasonCode,
} from "./reasonCodes.ts";
import type {
  DomainConfirmationResult,
  DomainConfirmationStatus,
  ExpectedCompanyIdentifiers,
  NormalizedFoundIdentifiers,
} from "./types.ts";

type IdentifierKind = "krs" | "nip" | "regon";

interface IdentifierSpec {
  kind: IdentifierKind;
  normalize: (raw: string) => string | null;
  verified: DomainConfirmationReasonCode;
  malformed: DomainConfirmationReasonCode;
  conflict: DomainConfirmationConflictCode;
}

const IDENTIFIER_SPECS: readonly IdentifierSpec[] = [
  { kind: "krs", normalize: normalizeKrsValue, verified: "KRS_IDENTIFIER_VERIFIED", malformed: "MALFORMED_KRS_VALUE", conflict: "KRS_CONFLICT" },
  { kind: "nip", normalize: normalizeNipValue, verified: "NIP_IDENTIFIER_VERIFIED", malformed: "MALFORMED_NIP_VALUE", conflict: "NIP_CONFLICT" },
  { kind: "regon", normalize: normalizeRegonValue, verified: "REGON_IDENTIFIER_VERIFIED", malformed: "MALFORMED_REGON_VALUE", conflict: "REGON_CONFLICT" },
];

/**
 * Pure, synchronous, deterministic confirmation decision. No network, no OpenAI.
 *
 * The EXPECTED KRS/NIP/REGON are consumed ONLY here, AFTER the provider call —
 * they are never part of the OpenAI request (see buildDomainConfirmationInput).
 * Because the model never saw them, a matching well-formed found value cannot be
 * an echo, which is what makes `confirmed` meaningful.
 *
 * Decision precedence (see the task's exact rules):
 *  1. any VALID found identifier differs from the expected one → `conflict`
 *     (a conflict always wins, even when another identifier matches),
 *  2. else, a malformed value blocks confirmation → `unverified`,
 *  3. else, ≥1 valid match AND ≥1 valid on-target-domain attested source
 *     → `confirmed`,
 *  4. else → `unverified`.
 */
export function evaluateDomainConfirmation(
  expected: ExpectedCompanyIdentifiers,
  found: NormalizedFoundIdentifiers,
  sourceOrigins: readonly string[],
  targetOrigin: string,
): DomainConfirmationResult {
  const reasonSet = new Set<DomainConfirmationReasonCode>();
  const conflictSet = new Set<DomainConfirmationConflictCode>();
  const verifiedIdentifiers: IdentifierKind[] = [];

  const malformedFlags: Record<IdentifierKind, boolean> = {
    krs: found.malformedKrs,
    nip: found.malformedNip,
    regon: found.malformedRegon,
  };

  let anyMalformed = false;
  let anyValidFound = false;

  for (const spec of IDENTIFIER_SPECS) {
    if (malformedFlags[spec.kind]) {
      anyMalformed = true;
      reasonSet.add(spec.malformed);
    }

    const foundValues = found[spec.kind];
    if (foundValues.length > 0) anyValidFound = true;

    const expectedRaw = expected[spec.kind];
    const expectedNorm = expectedRaw === null ? null : spec.normalize(expectedRaw);
    // No comparable expected identifier → this kind can neither verify nor conflict.
    if (expectedNorm === null) continue;

    let matched = false;
    let conflicting = false;
    for (const value of foundValues) {
      if (value === expectedNorm) matched = true;
      else conflicting = true;
    }
    if (matched) {
      reasonSet.add(spec.verified);
      verifiedIdentifiers.push(spec.kind);
    }
    if (conflicting) conflictSet.add(spec.conflict);
  }

  // Re-validate source origins against the URL-security policy AND the target
  // host (defense-in-depth even though extraction already filtered them).
  const targetHost = safeOriginFromUrl(targetOrigin)?.hostname ?? "";
  const validSources = [...new Set(
    sourceOrigins.filter((origin) => {
      const safe = safeOriginFromUrl(origin);
      return (
        safe !== null &&
        safe.origin === origin &&
        targetHost.length > 0 &&
        isTargetHost(safe.hostname, targetHost)
      );
    }),
  )].sort();
  const hasValidSource = validSources.length > 0;

  if (!anyValidFound) reasonSet.add("NO_INDEPENDENT_IDENTIFIER");
  if (!hasValidSource) reasonSet.add("NO_ATTESTED_SOURCE");

  let status: DomainConfirmationStatus;
  if (conflictSet.size > 0) {
    status = "conflict";
  } else if (verifiedIdentifiers.length > 0 && hasValidSource && !anyMalformed) {
    status = "confirmed";
  } else {
    status = "unverified";
  }

  return {
    status,
    confirmedOrigin: status === "confirmed" ? targetOrigin : null,
    verifiedIdentifiers: status === "confirmed" ? verifiedIdentifiers : [],
    reasons: CONFIRMATION_REASON_ORDER.filter((r) => reasonSet.has(r)),
    conflicts: CONFIRMATION_CONFLICT_ORDER.filter((c) => conflictSet.has(c)),
    sourceOrigins: validSources,
  };
}

/**
 * Builds a fail-closed `unverified` result (no confirmed origin, no verified
 * identifiers) for the provider-unavailable path — timeout, refusal, incomplete
 * response or provider failure.
 */
export function unavailableConfirmationResult(): DomainConfirmationResult {
  return {
    status: "unverified",
    confirmedOrigin: null,
    verifiedIdentifiers: [],
    reasons: ["CONFIRMATION_UNAVAILABLE"],
    conflicts: [],
    sourceOrigins: [],
  };
}
