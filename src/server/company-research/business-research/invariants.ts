import { isTargetHost } from "../domain-confirmation/targetHosts.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { BusinessResearchInvariantError } from "./errors.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";

/**
 * The validated confirmed-domain target extracted from a resolution result.
 */
export interface ConfirmedTarget {
  targetOrigin: string;
  targetDomain: string;
}

/** Deterministic, de-duplicated canonical set of origins (sorted). */
function canonicalSet(origins: readonly string[]): string[] {
  return [...new Set(origins)].sort();
}

/**
 * Validates a CONFIRMED resolution result IN FULL and returns its canonical
 * target. Every check guards a logically-impossible internal state and throws a
 * strict `BusinessResearchInvariantError` — an impossible confirmed state is
 * NEVER silently downgraded. Pure and synchronous; no budget, no network.
 *
 * NOTE on reuse: the domain-resolution helper `assertProbableSelection` requires
 * REFERENCE identity between the selected candidate and the probable candidate.
 * Resolution results are DETACHED (cloned), so that identity does not hold here;
 * we therefore compare canonical fields (origin + domain) instead — this is the
 * repository-safe way to validate a detached result.
 */
export function assertConfirmedResolutionTarget(
  resolution: CompanyDomainResolutionResult,
): ConfirmedTarget {
  const fail = (message: string): never => {
    throw new BusinessResearchInvariantError(message);
  };

  // (1) confirmed status.
  if (resolution.status !== "confirmed") fail("resolution is not confirmed");

  const { confirmedOrigin, selectedCandidate, confirmation } = resolution;

  // (2) confirmedOrigin non-null, safe and origin-only.
  if (confirmedOrigin === null) fail("confirmed resolution without a confirmed origin");
  const safeConfirmed = safeOriginFromUrl(confirmedOrigin);
  if (safeConfirmed === null || safeConfirmed.origin !== confirmedOrigin) {
    fail("confirmed origin is not safe / origin-only");
  }
  const confirmedHostname = safeConfirmed!.hostname;

  // (3) selectedCandidate non-null.
  if (selectedCandidate === null) fail("confirmed resolution without a selected candidate");
  const selected = selectedCandidate!;

  // (4) selectedCandidate is probable.
  if (selected.status !== "probable") fail("selected candidate is not probable");

  // (5) exactly one evaluated candidate is probable.
  const probable = resolution.evaluatedCandidates.filter((c) => c.status === "probable");
  if (probable.length !== 1) fail("resolution does not have exactly one probable candidate");

  // (6) selected candidate is semantically the sole probable candidate (fields,
  //     not reference — the result is detached).
  const sole = probable[0];
  if (sole.origin !== selected.origin || sole.domain !== selected.domain) {
    fail("selected candidate is not the sole probable candidate");
  }

  // (7) confirmation non-null.
  if (confirmation === null) fail("confirmed resolution without a confirmation result");
  const conf = confirmation!;

  // (8) confirmation is confirmed.
  if (conf.status !== "confirmed") fail("confirmation is not confirmed");

  // (9) confirmation origin equals the resolution origin.
  if (conf.confirmedOrigin !== confirmedOrigin) fail("confirmation origin differs from the resolution origin");

  // (10) selected candidate origin equals the confirmed origin.
  if (selected.origin !== confirmedOrigin) fail("selected candidate origin differs from the confirmed origin");

  // (11) selected candidate domain matches the validated confirmed-origin hostname.
  if (selected.domain !== confirmedHostname) fail("selected candidate domain differs from the confirmed hostname");
  if (!isTargetHost(confirmedHostname, selected.domain)) fail("confirmed hostname violates the target/apex-www policy");

  // (12) at least one verified identifier.
  if (conf.verifiedIdentifiers.length === 0) fail("confirmation has no verified identifiers");

  // (13) at least one confirmation source origin.
  if (conf.sourceOrigins.length === 0) fail("confirmation has no source origins");

  // (14) every confirmation source is safe, origin-only and on the target host.
  for (const origin of conf.sourceOrigins) {
    const safe = safeOriginFromUrl(origin);
    if (safe === null || safe.origin !== origin) fail("confirmation source is not origin-only");
    if (!isTargetHost(safe!.hostname, selected.domain)) fail("confirmation source is off the target domain");
  }

  // (15) at least one top-level source origin.
  if (resolution.sourceOrigins.length === 0) fail("confirmed resolution without any evidence source");

  // (17, top-level side) every top-level source is safe, origin-only, on-target.
  for (const origin of resolution.sourceOrigins) {
    const safe = safeOriginFromUrl(origin);
    if (safe === null || safe.origin !== origin) fail("resolution source is not origin-only");
    if (!isTargetHost(safe!.hostname, selected.domain)) fail("resolution source is off the target domain");
  }

  // (16) top-level and confirmation sources are the same canonical deduped set.
  const topSet = canonicalSet(resolution.sourceOrigins);
  const confSet = canonicalSet(conf.sourceOrigins);
  if (topSet.length !== confSet.length || topSet.some((o, i) => o !== confSet[i])) {
    fail("top-level and confirmation source sets differ");
  }

  return { targetOrigin: confirmedOrigin!, targetDomain: selected.domain };
}
