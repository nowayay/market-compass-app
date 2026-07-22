/**
 * Path-aware, structure-aware privacy policy.
 *
 * Two responsibilities, both pure and dependency-light:
 *  1. KEY rules — deterministic token-aware / normalized whole-key matching
 *     against an explicit denylist (NO broad substring matching, so `dashboard`,
 *     `keyboard`, `personalization`, `personCount` are NOT rejected).
 *  2. VALUE rules — path-aware application of the string-value detectors, so a
 *     valid KRS/NIP/REGON identifier, a source/request/candidate id, or an ISO
 *     date is never mistaken for a phone number, and a legal-entity name is
 *     never rejected merely for resembling a person's name.
 *
 * Values are never returned or embedded anywhere — only a stable rule code.
 */
import {
  containsEmail,
  containsPersonRolePhrase,
  containsPersonalProfileUrl,
  containsPesel,
  containsPhone,
  foldDiacritics,
} from "./personalDataPatterns.ts";

export type PrivacyRuleCode =
  | "FORBIDDEN_KEY"
  | "EMAIL_ADDRESS"
  | "PHONE_NUMBER"
  | "PESEL"
  | "PERSONAL_PROFILE_URL"
  | "PERSON_ROLE_PHRASE";

/**
 * Single tokens that unambiguously denote natural-person data when they appear
 * as a WHOLE key token (folded, lower-case). `person` is deliberately NOT here
 * (see `personCount`); it is only forbidden in a compound like `personName`.
 */
const FORBIDDEN_SINGLE_TOKENS: ReadonlySet<string> = new Set([
  // English roles / person markers
  "owner", "founder", "cofounder", "employee", "representative", "proxy",
  "biography", "shareholder", "board", "ceo", "cfo", "cto", "coo", "president",
  "chairman", "director", "manager", "email", "phone", "telephone", "fax",
  "mobile",
  // Polish (folded)
  "nazwisko", "imie", "pesel", "czlonek", "zarzad", "wspolnik", "prokurent",
  "pelnomocnik", "beneficjent", "wlasciciel", "udzialowiec", "akcjonariusz",
  "pracownik", "zalozyciel", "prezes", "dyrektor", "kierownik", "reprezentacja",
  "reprezentant",
]);

/**
 * Compound keys (normalized: folded, separators removed) that denote a person.
 * Catches all-lowercase, camelCase, snake_case and kebab-case spellings.
 */
const FORBIDDEN_COMPOUNDS: ReadonlySet<string> = new Set([
  "boardmember", "boardmembers", "managementmember", "managementmembers",
  "contactperson", "contactpersons", "firstname", "lastname", "middlename",
  "fullname", "givenname", "familyname", "personname", "personalemail",
  "personalphone", "personaldata", "personaldetails", "dateofbirth",
  "birthdate", "beneficialowner", "ultimatebeneficialowner", "memberoftheboard",
  "contactname",
]);

/** Governing keys (normalized) whose values are structured identifiers/dates/
 * codes and must be exempt from the numeric (phone/PESEL) detectors. */
const NUMERIC_SAFE_KEYS: ReadonlySet<string> = new Set([
  "krs", "nip", "regon", "id", "requestid", "candidateid", "candidateids",
  "sourceids", "sourceid", "retrievedat", "publishedat", "verifiedat",
  "lastverifiedat", "researchedat", "registrationdate", "foundedyear",
  "completenessscore", "score", "confidence", "version", "primarycode",
  "secondarycodes", "code", "targetpath", "path", "resolution",
  // Domain-discovery matched identifier signals (structured registry ids).
  "matchedkrs", "matchednip", "matchedregon",
]);

/**
 * Explicit approved LEGAL-ENTITY-NAME paths — the ONLY places a value may
 * legitimately resemble a person's name (KRS-verified / approved company names
 * in the current contract). Matched as a path SUFFIX so the varying root label
 * ("response", "company", …) is irrelevant, while an arbitrary object such as
 * `contact.name` is NOT exempt.
 *
 * A legal company name may legitimately contain a person's first name and
 * surname; on these paths the role-plus-name heuristic is NOT applied. Direct
 * identifier protections (email, phone, PESEL, personal-profile URL) still run
 * everywhere. The list is path-specific — an arbitrary field named `name` or
 * `matchedLegalName` elsewhere is NOT exempt.
 *
 * Contract / internal paths:
 *  - company.identity.legalName / displayName / aliases[*]  (CompanyProfile)
 *  - candidates[*].legalName / displayName                  (CompanyCandidate)
 *  - domainDiscoveryInput.legalName                         (discovery input)
 *  - …signals.matchedLegalName                              (discovery candidate)
 *  - domainDiscoverySignals[*].matchedLegalName             (discovery signals)
 *  - domainConfirmationInput.legalName                      (confirmation input)
 */
const LEGAL_NAME_PATH_RES: readonly RegExp[] = [
  /(?:^|\.)company\.identity\.legalName$/,
  /(?:^|\.)company\.identity\.displayName$/,
  /(?:^|\.)company\.identity\.aliases\[\d+\]$/,
  /(?:^|\.)candidates\[\d+\]\.legalName$/,
  /(?:^|\.)candidates\[\d+\]\.displayName$/,
  // Official domain discovery — legal-entity-name fields (matched by their
  // specific structural context, never a bare `name`/`matchedLegalName` key).
  /(?:^|\.)domainDiscoveryInput\.legalName$/,
  /(?:^|\.)signals\.matchedLegalName$/,
  /(?:^|\.)domainDiscoverySignals\[\d+\]\.matchedLegalName$/,
  // Official domain confirmation — legal name is a search-targeting hint only.
  /(?:^|\.)domainConfirmationInput\.legalName$/,
  // Structured business research — legal name is a search-targeting hint only.
  /(?:^|\.)businessResearchInput\.legalName$/,
];

/** True only for an explicit approved legal-entity-name path. */
export function isApprovedLegalNamePath(path: string): boolean {
  return LEGAL_NAME_PATH_RES.some((re) => re.test(path));
}

/**
 * Known STATIC field names from the contract + internal domain types. Only these
 * may appear verbatim in a diagnostic path; any other (dynamic / injected /
 * personal-looking) object key is redacted so it can never be copied into an
 * error message or log. Array indices are emitted separately and always allowed.
 */
const KNOWN_PATH_KEYS: ReadonlySet<string> = new Set([
  // Response envelope
  "status", "requestId", "query", "company", "expansionInputs", "sources",
  "evidence", "quality", "meta", "candidates", "message", "reason",
  // Query
  "name", "countryCode", "foundedYear", "krs",
  // Company profile
  "identity", "location", "website", "industry", "business",
  "legalName", "displayName", "aliases", "identifiers", "legalForm",
  "legalStatus", "registrationDate", "nip", "regon", "city", "region",
  "url", "domain", "verified", "primaryCode", "secondaryCodes", "labels",
  "description", "productsServices", "customerSegments", "operatingMarkets",
  // Candidate
  "candidateId", "confidence", "matchReasons", "sourceIds",
  // Source
  "id", "provider", "type", "authority", "retrievedAt", "publishedAt",
  // Evidence
  "facts", "target", "path", "itemId", "support", "derivation", "verifiedAt",
  // Quality
  "identityConfidence", "level", "score", "completenessScore", "missingFields",
  "conflicts", "warnings", "lastVerifiedAt", "code", "targetPath", "resolution",
  // Expansion inputs
  "currentMarkets", "productCategories", "customerType", "salesChannels",
  "internationalExperience", "digitalPresence", "scaleSignals",
  "regulatoryConstraints", "operationalConstraints", "missingCriticalInputs",
  // Meta
  "researchedAt", "version",
  // Internal KrsCompany / discovery
  "pkdPrimaryCode", "pkdSecondaryCodes", "pkdLabels", "registerType",
  // Internal domain-discovery candidates
  "origin", "signals", "sourceOrigins", "matchedLegalName", "matchedKrs",
  "matchedNip", "matchedRegon", "matchedCity",
  // Internal domain-evaluation result
  "reasons", "selectedCandidate",
  // Internal domain-confirmation (input, provider result, decision)
  "targetDomain", "targetOrigin", "found", "malformedKrs", "malformedNip",
  "malformedRegon", "foundKrsValues", "foundNipValues", "foundRegonValues",
  "confirmedOrigin", "verifiedIdentifiers",
]);

/**
 * Returns a key that is safe to embed in a diagnostic path: a known static field
 * name is kept; anything else (a dynamic or personal-looking key) is redacted.
 */
export function safePathKey(key: string): string {
  return KNOWN_PATH_KEYS.has(key) ? key : "<redacted>";
}

/** Splits a key into folded, lower-case tokens across camel/snake/kebab/space. */
export function tokenizeKey(key: string): string[] {
  return foldDiacritics(
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_\-\s]+/g, " ")
      .trim(),
  )
    .split(" ")
    .filter((t) => t.length > 0);
}

/** Normalizes a key to a folded, separator-free, lower-case string. */
export function normalizeKey(key: string): string {
  return foldDiacritics(key).replace(/[^a-z0-9]/g, "");
}

/** Returns a rule code when the KEY denotes natural-person data, else null. */
export function keyViolationCode(key: string): PrivacyRuleCode | null {
  const tokens = tokenizeKey(key);
  for (const token of tokens) {
    if (FORBIDDEN_SINGLE_TOKENS.has(token)) return "FORBIDDEN_KEY";
  }
  // Adjacent token pairs (e.g. ["contact","person"] → "contactperson").
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (FORBIDDEN_COMPOUNDS.has(tokens[i] + tokens[i + 1])) return "FORBIDDEN_KEY";
  }
  if (FORBIDDEN_COMPOUNDS.has(normalizeKey(key))) return "FORBIDDEN_KEY";
  return null;
}

/**
 * Returns a rule code when the string VALUE contains natural-person data.
 *
 * Path-aware: the numeric (phone) detector is skipped for structured-identifier
 * governing keys, and the role/person-name heuristic is skipped ONLY on the
 * explicit approved legal-entity-name paths (never for a generic `name` key).
 */
export function valueViolationCode(
  value: string,
  governingKeyNormalized: string | null,
  path: string,
): PrivacyRuleCode | null {
  // Contact info & profile URLs are never legitimate anywhere in the payload.
  if (containsEmail(value)) return "EMAIL_ADDRESS";
  if (containsPersonalProfileUrl(value)) return "PERSONAL_PROFILE_URL";
  if (containsPesel(value)) return "PESEL";

  const key = governingKeyNormalized ?? "";
  const numericSafe = NUMERIC_SAFE_KEYS.has(key);
  if (!numericSafe && containsPhone(value)) return "PHONE_NUMBER";

  // A legal-entity name may legitimately resemble a person's name, but ONLY on an
  // approved contract path. Everywhere else a role + person-name phrase is rejected.
  if (!isApprovedLegalNamePath(path) && containsPersonRolePhrase(value)) {
    return "PERSON_ROLE_PHRASE";
  }

  return null;
}
