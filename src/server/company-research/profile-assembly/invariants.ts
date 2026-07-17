/**
 * Pure defensive invariants for the profile-assembly stage.
 *
 * Each guard protects a logically-impossible internal state (a broken contract
 * between the KRS mapper / domain resolution / business research and this stage)
 * and throws a strict `ProfileAssemblyInvariantError` — an impossible state is
 * NEVER silently repaired or downgraded. Pure and synchronous; no network.
 */
import { z } from "zod";
import {
  CUSTOMER_SEGMENTS_PATH,
  INDUSTRY_DESCRIPTION_PATH,
  OPERATING_MARKETS_PATH,
  PRODUCTS_SERVICES_PATH,
} from "../business-research/buildBusinessEvidence.ts";
import { businessItemId, businessSourceId } from "../business-research/ids.ts";
import { assertConfirmedResolutionTarget } from "../business-research/invariants.ts";
import type { ConfirmedTarget } from "../business-research/invariants.ts";
import { canonicalKey, normalizeText } from "../business-research/normalizeBusinessFacts.ts";
import { isTargetHost } from "../domain-confirmation/targetHosts.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { BusinessResearchInvariantError } from "../business-research/errors.ts";
import { ProfileAssemblyInvariantError } from "./errors.ts";
import type { CompanyProfile, ResearchSource } from "../../../contracts/companyResearch.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type {
  StructuredBusinessFacts,
  StructuredBusinessResearchResult,
} from "../business-research/types.ts";
import type { KrsCompany } from "../types.ts";

export type { ConfirmedTarget } from "../business-research/invariants.ts";

/** Exactly-10-digit KRS shape (mirrors the identification normalization guarantee). */
const KRS_RE = /^[0-9]{10}$/;

const fail = (message: string): never => {
  throw new ProfileAssemblyInvariantError(message);
};

/** True for a non-empty string. */
function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** True for `undefined` or a non-empty string (an absent-or-string optional field). */
function isOptionalString(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

/** True for a string array whose every item is a non-empty string. */
function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((v) => typeof v === "string" && v.length > 0);
}

/**
 * The exact ISO-datetime runtime rule the public contract uses for
 * `FactEvidence.verifiedAt` (`z.iso.datetime()`), reused here so every timestamp
 * crossing the assembly boundary matches the same contract semantics. It requires
 * a complete ISO 8601 datetime with a `Z` (UTC) designator and rejects date-only
 * strings, locale-formatted dates, timezone-less timestamps, bare offsets and
 * impossible calendar dates — i.e. values `Date.parse` would wrongly accept.
 */
const ISO_DATETIME = z.iso.datetime();

/** True only for a canonical ISO datetime string per the contract rule. */
function isIsoDateTime(value: unknown): boolean {
  return typeof value === "string" && ISO_DATETIME.safeParse(value).success;
}

/**
 * Obtains the single validated assembly timestamp from the injected clock. The
 * clock is called EXACTLY ONCE; the returned runtime value must be a `Date` with a
 * finite timestamp, and only then is it converted to ISO and re-checked with the
 * same contract rule.
 *
 * The whole dependency boundary is wrapped in ONE narrow try/catch (scoped to this
 * helper only — never around the assembler): a malformed normal return (non-`Date`,
 * `Invalid Date`, non-canonical ISO string) throws `ProfileAssemblyInvariantError`,
 * and ANY exception thrown by the injected clock or a hostile `Date` method
 * (`now()`, `getTime()`, `toISOString()`, schema validation) is translated into a
 * generic `ProfileAssemblyInvariantError`. An already-created
 * `ProfileAssemblyInvariantError` is rethrown unchanged; every other thrown value
 * is discarded (never surfaced as a message, name, `cause` or value), so no raw
 * `TypeError`/`RangeError`/`ZodError` and no original detail can escape.
 */
export function getAssemblyTimestamp(now: () => Date): string {
  try {
    const value: unknown = now();
    // Short-circuit guards the `.getTime()`/`.toISOString()` calls: a non-Date value
    // never reaches them.
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new ProfileAssemblyInvariantError("assembly clock returned an invalid Date");
    }
    const iso = value.toISOString();
    if (!isIsoDateTime(iso)) {
      throw new ProfileAssemblyInvariantError("assembly clock produced a non-canonical ISO datetime");
    }
    return iso;
  } catch (error) {
    // Preserve our own strict error; translate anything else (a thrown clock
    // exception or hostile Date method) into a generic one — never forwarding the
    // original message/name/value/cause.
    if (error instanceof ProfileAssemblyInvariantError) throw error;
    throw new ProfileAssemblyInvariantError("assembly clock failed");
  }
}

/**
 * Validates the COMPLETE runtime shape of the KRS company that the KRS mappers
 * (`buildCompanyProfile`, `buildKrsSource`, `buildKrsFactEvidence`) consume, so a
 * malformed field throws a strict assembly error rather than a raw `TypeError` or
 * an invalid source/evidence record. It validates exactly what the mappers require
 * (no invented business rules). The generic messages never expose a raw value.
 */
export function assertValidKrsCompany(company: KrsCompany): void {
  // Treat the input as unknown at runtime — the static type is not a guarantee.
  const c = company as unknown as Record<string, unknown>;
  if (typeof c !== "object" || c === null) fail("KRS company is not an object");

  if (!isNonEmptyString(c.legalName)) fail("KRS company legalName is not a non-empty string");
  if (typeof c.krs !== "string" || !KRS_RE.test(c.krs)) fail("KRS company krs is not a 10-digit string");
  if (!isNonEmptyString(c.countryCode)) fail("KRS company countryCode is not a non-empty string");

  if (!isOptionalString(c.nip)) fail("KRS company nip has an unsupported type");
  if (!isOptionalString(c.regon)) fail("KRS company regon has an unsupported type");
  if (!isOptionalString(c.legalForm)) fail("KRS company legalForm has an unsupported type");
  if (!isOptionalString(c.registrationDate)) fail("KRS company registrationDate has an unsupported type");
  if (!isOptionalString(c.city)) fail("KRS company city has an unsupported type");
  if (!isOptionalString(c.region)) fail("KRS company region has an unsupported type");
  if (!isOptionalString(c.pkdPrimaryCode)) fail("KRS company pkdPrimaryCode has an unsupported type");
  if (!isOptionalString(c.registerType)) fail("KRS company registerType has an unsupported type");

  if (!isStringArray(c.pkdSecondaryCodes)) fail("KRS company pkdSecondaryCodes is not a string array");
  if (!isStringArray(c.pkdLabels)) fail("KRS company pkdLabels is not a string array");

  if (!isIsoDateTime(c.retrievedAt)) fail("KRS company retrievedAt is not a canonical ISO datetime");
}

/**
 * Validates a CONFIRMED domain-resolution result in full and returns its canonical
 * target. Delegates to the shared confirmed-resolution validator and re-throws any
 * broken invariant as a strict assembly error (never a silent website downgrade).
 */
export function resolveConfirmedTarget(resolution: CompanyDomainResolutionResult): ConfirmedTarget {
  try {
    return assertConfirmedResolutionTarget(resolution);
  } catch (cause) {
    if (cause instanceof BusinessResearchInvariantError) {
      throw new ProfileAssemblyInvariantError("confirmed resolution failed validation", cause);
    }
    throw cause;
  }
}

/**
 * Validates ONE accepted business-research source in full. Every check guards a
 * malformed provenance record that could otherwise be reused (e.g. as the website
 * source) despite a valid-looking id. A malformed source is never silently
 * repaired — it throws. The source must be origin-only, on the confirmed target
 * domain (host or its exact apex/www counterpart — arbitrary subdomains rejected),
 * carry the exact web-search semantics, and have the deterministic id derived from
 * its own normalized origin.
 */
export function assertValidBusinessSource(source: ResearchSource, targetDomain: string): void {
  const s = source as unknown as Record<string, unknown>;
  if (typeof s !== "object" || s === null) fail("business source is not an object");

  // (6) expected semantics.
  if (s.provider !== "openai_web_search") fail("business source has an unexpected provider");
  if (s.type !== "official_company_website") fail("business source has an unexpected type");
  if (s.authority !== "primary") fail("business source has an unexpected authority");

  // (1,2) url valid AND already origin-only (no path/query/fragment/credentials).
  if (typeof s.url !== "string") fail("business source url is missing");
  const safe = safeOriginFromUrl(s.url);
  if (safe === null || safe.origin !== s.url) fail("business source url is not origin-only");

  // (3) domain field equals the hostname derived from the url.
  if (s.domain !== safe!.hostname) fail("business source domain does not match its url hostname");

  // (4,5) hostname belongs to the confirmed target host or its exact apex/www.
  if (!isTargetHost(safe!.hostname, targetDomain)) fail("business source is off the confirmed domain");

  // (7) id is the deterministic id of its own normalized origin.
  if (s.id !== businessSourceId(safe!.origin)) fail("business source id is inconsistent with its url");

  // (9) publishedAt/retrievedAt satisfy the ResearchSource runtime contract
  //     (canonical ISO datetime; publishedAt may also be null).
  if (!isIsoDateTime(s.retrievedAt)) fail("business source retrievedAt is not a canonical ISO datetime");
  if (s.publishedAt !== null && !isIsoDateTime(s.publishedAt)) {
    fail("business source publishedAt is neither null nor a canonical ISO datetime");
  }
}

/** Asserts an evidence record has at least one source id, with no duplicates. */
function assertEvidenceSourceIds(sourceIds: readonly string[], context: string): void {
  if (sourceIds.length === 0) fail(`${context} without any source id`);
  if (new Set(sourceIds).size !== sourceIds.length) fail(`${context} with duplicate source ids`);
}

/**
 * Asserts a value is a string already in the accepted deterministic display
 * normalization (`normalizeText`) and materially non-empty after normalization. No
 * trimming/whitespace-collapse/coercion is performed — a non-normalized value is
 * rejected, never repaired.
 */
function assertMaterialNormalizedString(value: unknown, context: string): void {
  if (typeof value !== "string") fail(`${context} is not a string`);
  const normalized = normalizeText(value as string);
  if (normalized.length === 0) fail(`${context} is empty after normalization`);
  if (normalized !== value) fail(`${context} is not in the accepted normalized form`);
}

/**
 * Validates the COMPLETE runtime shape of the structured business facts BEFORE any
 * emptiness/status/overlay/description/evidence logic runs (so a malformed value
 * throws a strict assembly error rather than a raw `TypeError`, and a whitespace-
 * only fact is never treated as material). `industryDescription` is null or a
 * materially non-empty normalized string; each list is an array of materially
 * non-empty normalized strings. Nothing is trimmed, coerced, defaulted or dropped.
 */
export function assertValidBusinessFacts(facts: StructuredBusinessFacts): void {
  const f = facts as unknown as Record<string, unknown>;
  if (typeof f !== "object" || f === null) fail("business facts is not an object");

  if (f.industryDescription !== null) {
    assertMaterialNormalizedString(f.industryDescription, "business industryDescription");
  }

  const lists: Array<[string, unknown]> = [
    ["productsServices", f.productsServices],
    ["customerSegments", f.customerSegments],
    ["operatingMarkets", f.operatingMarkets],
  ];
  for (const [name, value] of lists) {
    if (!Array.isArray(value)) fail(`business ${name} is not an array`);
    for (const item of value as unknown[]) {
      assertMaterialNormalizedString(item, `business ${name} item`);
    }
  }
}

/**
 * Rejects canonical-duplicate facts WITHIN each list category. Two values that
 * collapse to the same `canonicalKey` (case variants — spacing variants already
 * fail normalization) would share one stable item/evidence identity while
 * surviving as two profile entries, so they are rejected rather than merged.
 * Cross-category equality is allowed; diacritic distinctions are preserved because
 * `canonicalKey` preserves them. Requires the runtime shape to be valid first.
 */
export function assertUniqueCanonicalFacts(facts: StructuredBusinessFacts): void {
  const check = (name: string, values: readonly string[]): void => {
    const keys = new Set<string>();
    for (const value of values) {
      const key = canonicalKey(value);
      if (keys.has(key)) fail(`business ${name} has a canonical-duplicate fact`);
      keys.add(key);
    }
  };
  check("productsServices", facts.productsServices);
  check("customerSegments", facts.customerSegments);
  check("operatingMarkets", facts.operatingMarkets);
}

/** True when the business facts carry no accepted value at all. */
function factsAreEmpty(facts: StructuredBusinessFacts): boolean {
  return (
    facts.industryDescription === null &&
    facts.productsServices.length === 0 &&
    facts.customerSegments.length === 0 &&
    facts.operatingMarkets.length === 0
  );
}

/** The set of evidence target keys implied by accepted business facts. */
function expectedBusinessTargets(facts: StructuredBusinessFacts): Set<string> {
  const keys = new Set<string>();
  if (facts.industryDescription !== null) keys.add(`${INDUSTRY_DESCRIPTION_PATH} `);
  const addList = (path: string, values: readonly string[]): void => {
    for (const value of values) keys.add(`${path} ${businessItemId(path, canonicalKey(value))}`);
  };
  addList(PRODUCTS_SERVICES_PATH, facts.productsServices);
  addList(CUSTOMER_SEGMENTS_PATH, facts.customerSegments);
  addList(OPERATING_MARKETS_PATH, facts.operatingMarkets);
  return keys;
}

/**
 * Asserts the four-category completeness contract implied by the status:
 *  - `completed` — all four categories are populated,
 *  - `partial`   — at least one material fact AND at least one empty category.
 * An upstream object whose status disagrees with its facts is rejected.
 */
function assertStatusCategoryContract(
  status: "completed" | "partial",
  facts: StructuredBusinessFacts,
): void {
  const hasIndustry = facts.industryDescription !== null;
  const hasProducts = facts.productsServices.length > 0;
  const hasSegments = facts.customerSegments.length > 0;
  const hasMarkets = facts.operatingMarkets.length > 0;
  const allFour = hasIndustry && hasProducts && hasSegments && hasMarkets;
  const anyMaterial = hasIndustry || hasProducts || hasSegments || hasMarkets;

  if (status === "completed") {
    if (!allFour) fail("completed research without all four business categories");
    return;
  }
  // partial
  if (!anyMaterial) fail("partial research without any material fact");
  if (allFour) fail("partial research with all four business categories populated");
}

/**
 * Validates the business-research contribution against the confirmed target.
 *
 *  - `completed` / `partial`: facts are accepted, so the researched origin must
 *    equal the confirmed origin; the status must agree with category completeness;
 *    every source must be a valid origin-only on-domain web-search source; every
 *    evidence record must have non-empty, unique, resolving source ids; and the
 *    evidence targets must be exactly the targets implied by the accepted facts.
 *  - `unverified` / `skipped`: no facts, sources or evidence may be present — such
 *    a result can never smuggle a business fact into the profile.
 */
export function assertBusinessResearchConsistency(
  business: StructuredBusinessResearchResult,
  confirmedTarget: ConfirmedTarget | null,
): void {
  // (B) Validate the complete runtime shape FIRST — before any emptiness/status
  //     check, canonical ordering, overlay, description or evidence logic — so a
  //     malformed or whitespace-only fact can never be treated as material.
  assertValidBusinessFacts(business.facts);

  if (business.status === "unverified" || business.status === "skipped") {
    if (!factsAreEmpty(business.facts)) fail("unverified/skipped research carries business facts");
    if (business.sources.length > 0) fail("unverified/skipped research carries sources");
    if (business.evidence.length > 0) fail("unverified/skipped research carries evidence");
    return;
  }

  // completed / partial — facts are accepted.
  if (factsAreEmpty(business.facts)) fail("accepted business research without any fact");
  if (confirmedTarget === null) {
    // Direct throw (not the `never` helper) so the compiler narrows for the
    // property accesses below.
    throw new ProfileAssemblyInvariantError("accepted business facts without a confirmed website");
  }
  if (business.researchedOrigin !== confirmedTarget.targetOrigin) {
    fail("business researchedOrigin differs from the confirmed origin");
  }
  if (business.sources.length === 0) fail("accepted business facts without any source");
  if (business.evidence.length === 0) fail("accepted business facts without any evidence");

  // (C) no canonical-duplicate facts within any list category (each retained fact
  //     must map to exactly one stable evidence target/item).
  assertUniqueCanonicalFacts(business.facts);

  // (C) status ↔ category completeness.
  assertStatusCategoryContract(business.status, business.facts);

  // (A) every accepted business source is a valid origin-only on-domain source.
  for (const source of business.sources) {
    assertValidBusinessSource(source, confirmedTarget.targetDomain);
  }

  // (B) every evidence record has non-empty, unique, resolving source ids.
  const businessSourceIds = new Set(business.sources.map((s) => s.id));
  for (const e of business.evidence) {
    assertEvidenceSourceIds(e.sourceIds, "business evidence");
    for (const sid of e.sourceIds) {
      if (!businessSourceIds.has(sid)) fail("business evidence references a missing business source");
    }
  }

  // Bijection: every accepted fact has evidence and every evidence targets a fact.
  const expected = expectedBusinessTargets(business.facts);
  const actual = new Set(business.evidence.map((e) => `${e.target.path} ${e.target.itemId ?? ""}`));
  if (expected.size !== actual.size) fail("business evidence does not match accepted facts");
  for (const key of expected) {
    if (!actual.has(key)) fail("an accepted business fact is missing evidence");
  }
}

/** Asserts the final profile exposes no exact page URL (website url is origin-only). */
export function assertNoExactPageUrl(profile: CompanyProfile): void {
  const url = profile.website.url;
  if (url === undefined) return;
  const safe = safeOriginFromUrl(url);
  if (safe === null || safe.origin !== url) {
    throw new ProfileAssemblyInvariantError("profile website url is not origin-only");
  }
}
