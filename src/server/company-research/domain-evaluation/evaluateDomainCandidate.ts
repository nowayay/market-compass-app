import { nameMatchScore } from "../identification/normalizeCompanyName.ts";
import { STRONG_NAME_THRESHOLD } from "../identification/matchCompanyCandidates.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import {
  domainTokenMatch,
  normalizeCityValue,
  normalizeKrsValue,
  normalizeNipValue,
  normalizeRegonValue,
} from "./normalizeDomainSignals.ts";
import { CONFLICT_ORDER, REASON_ORDER } from "./reasonCodes.ts";
import type {
  DomainEvaluationConflictCode,
  DomainEvaluationReasonCode,
} from "./reasonCodes.ts";
import type { DiscoveredDomainCandidate } from "../domain-discovery/types.ts";
import type {
  DomainCandidateStatus,
  DomainEvaluationCompany,
  EvaluatedDomainCandidate,
} from "./types.ts";

/**
 * Centralized, documented scoring weights. Scoring is deterministic and SECONDARY
 * to the hard rules: an identifier conflict always rejects (score is not
 * consulted). An exact model-returned identifier is only an untrusted DISCOVERY
 * signal — it can make one candidate stronger, but never proves ownership. The
 * theoretical maximum KRS+NIP+REGON+NAME_EXACT+CITY+TOKEN = 300 is the clamp
 * ceiling.
 */
export const EVALUATION_WEIGHTS = {
  KRS_SIGNAL: 100,
  NIP_SIGNAL: 80,
  REGON_SIGNAL: 70,
  NAME_EXACT: 30,
  NAME_STRONG: 20,
  CITY_MATCH: 10,
  DOMAIN_TOKEN: 10,
} as const;

export const MAX_EVALUATION_SCORE = 300;

type IdOutcome = "match" | "conflict" | "malformed" | "neutral";

/** Deterministic single-identifier comparison. Missing values are never conflicts. */
function compareIdentifier(
  companyRaw: string | null,
  signalRaw: string | null,
  normalize: (raw: string) => string | null,
): IdOutcome {
  if (signalRaw === null) return "neutral"; // no signal supplied
  const signal = normalize(signalRaw);
  if (signal === null) return "malformed"; // explicitly reported but invalid → fail-closed
  const company = companyRaw === null ? null : normalize(companyRaw);
  if (company === null) return "neutral"; // company lacks this identifier → cannot match
  return company === signal ? "match" : "conflict";
}

/**
 * Deterministically evaluates ONE discovered candidate against the KRS-verified
 * company. Pure, synchronous, no network/OpenAI. Never mutates the input and
 * never produces "confirmed".
 */
export function evaluateDomainCandidate(
  company: DomainEvaluationCompany,
  candidate: DiscoveredDomainCandidate,
): EvaluatedDomainCandidate {
  const names = [company.legalName, ...company.aliases];
  const reasonSet = new Set<DomainEvaluationReasonCode>();
  const conflictSet = new Set<DomainEvaluationConflictCode>();
  let score = 0;

  // --- Registry identifiers (untrusted discovery signals) ---
  const krs = compareIdentifier(company.krs, candidate.signals.matchedKrs, normalizeKrsValue);
  const nip = compareIdentifier(company.nip, candidate.signals.matchedNip, normalizeNipValue);
  const regon = compareIdentifier(company.regon, candidate.signals.matchedRegon, normalizeRegonValue);

  if (krs === "match") { reasonSet.add("KRS_DISCOVERY_SIGNAL_MATCH"); score += EVALUATION_WEIGHTS.KRS_SIGNAL; }
  else if (krs === "conflict") conflictSet.add("KRS_CONFLICT");
  else if (krs === "malformed") conflictSet.add("MALFORMED_KRS_SIGNAL");

  if (nip === "match") { reasonSet.add("NIP_DISCOVERY_SIGNAL_MATCH"); score += EVALUATION_WEIGHTS.NIP_SIGNAL; }
  else if (nip === "conflict") conflictSet.add("NIP_CONFLICT");
  else if (nip === "malformed") conflictSet.add("MALFORMED_NIP_SIGNAL");

  if (regon === "match") { reasonSet.add("REGON_DISCOVERY_SIGNAL_MATCH"); score += EVALUATION_WEIGHTS.REGON_SIGNAL; }
  else if (regon === "conflict") conflictSet.add("REGON_CONFLICT");
  else if (regon === "malformed") conflictSet.add("MALFORMED_REGON_SIGNAL");

  const hasIdentifierSignalMatch = krs === "match" || nip === "match" || regon === "match";
  const anyIdentifierSupplied =
    candidate.signals.matchedKrs !== null ||
    candidate.signals.matchedNip !== null ||
    candidate.signals.matchedRegon !== null;

  // --- Legal-name similarity (supporting; reuses canonical name matching) ---
  let strongName = false;
  if (candidate.signals.matchedLegalName !== null) {
    let best = 0;
    for (const name of names) best = Math.max(best, nameMatchScore(candidate.signals.matchedLegalName, name));
    if (best >= 1) { reasonSet.add("LEGAL_NAME_EXACT_MATCH"); score += EVALUATION_WEIGHTS.NAME_EXACT; strongName = true; }
    else if (best >= STRONG_NAME_THRESHOLD) { reasonSet.add("LEGAL_NAME_STRONG_MATCH"); score += EVALUATION_WEIGHTS.NAME_STRONG; strongName = true; }
  }

  // --- City (supporting; only when BOTH are present) ---
  let cityOk = true;
  if (company.city !== null && candidate.signals.matchedCity !== null) {
    const normalizedCity = normalizeCityValue(company.city);
    const cityMatch = normalizedCity.length > 0 && normalizedCity === normalizeCityValue(candidate.signals.matchedCity);
    cityOk = cityMatch;
    if (cityMatch) { reasonSet.add("CITY_MATCH"); score += EVALUATION_WEIGHTS.CITY_MATCH; }
  }

  // --- Domain-name tokens (weak supporting signal) ---
  const domainToken = domainTokenMatch(candidate.domain, names);
  if (domainToken) { reasonSet.add("DOMAIN_TOKEN_MATCH"); score += EVALUATION_WEIGHTS.DOMAIN_TOKEN; }

  if (!hasIdentifierSignalMatch) reasonSet.add("IDENTIFIER_MATCH_MISSING");

  // --- Deterministic status (identifier conflict always wins; never "confirmed") ---
  let status: DomainCandidateStatus;
  if (conflictSet.size > 0) {
    status = "rejected";
    score = 0;
  } else if (hasIdentifierSignalMatch) {
    // Path A: at least one exact discovery identifier signal, no conflicts.
    status = "probable";
  } else if (!anyIdentifierSupplied && strongName && cityOk && domainToken) {
    // Path B: no identifier signals, but strong name + city + domain-token.
    status = "probable";
  } else {
    status = "unverified";
    reasonSet.add("INSUFFICIENT_SIGNALS");
  }

  // Re-validate carried-over origins against the existing URL-security policy.
  const sourceOrigins = candidate.sourceOrigins.filter((origin) => {
    const safe = safeOriginFromUrl(origin);
    return safe !== null && safe.origin === origin;
  });

  return {
    origin: candidate.origin,
    domain: candidate.domain,
    status,
    score: Math.max(0, Math.min(MAX_EVALUATION_SCORE, score)),
    reasons: REASON_ORDER.filter((r) => reasonSet.has(r)),
    conflicts: CONFLICT_ORDER.filter((c) => conflictSet.has(c)),
    sourceOrigins,
    signals: candidate.signals,
  };
}
