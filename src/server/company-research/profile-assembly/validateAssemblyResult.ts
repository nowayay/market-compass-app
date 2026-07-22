/**
 * Strict cross-stage consistency validation for a RAW `CompanyProfileAssemblyResult`
 * against the exact inputs (`KrsCompany`, domain-resolution result, business-research
 * result) that produced it.
 *
 * This does NOT re-implement `assembleCompanyProfile` (it never calls it, never
 * reads a clock, never manufactures a timestamp): it re-derives the EXACT expected
 * profile/status/reasons/sources/evidence by reusing the SAME pure, already-exported
 * building blocks the assembler itself calls (`buildAssembledProfile`,
 * `canonicalizeBusinessFacts`, `deriveStatus`, `deriveReasons`,
 * `descriptionComponentSourceIds`, `mergeSources`, `mergeEvidence`,
 * `buildWebsiteSource`, `buildWebsiteEvidence`, `buildKrsSource`,
 * `buildKrsFactEvidence`) and compares the result against them.
 *
 * Timestamp policy (never calls `now()`, never manufactures a second
 * timestamp): the real assembler reads its clock EXACTLY ONCE per invocation
 * and shares that ONE value across every record it derives from it. This
 * validator takes that SINGLE assembly-owned value as an explicit, ALREADY
 * TRUSTED `trustedAssembledAt` parameter — captured by the caller from the
 * real clock read via a tracked wrapper (see `web-research/assemblyClock.ts`),
 * never re-derived from `result` itself. It builds the exact expected
 * website-source/website-evidence/description-evidence records using that
 * trusted value and compares them against `result` field-for-field, so a
 * dependency that fabricates self-consistent-but-wrong timestamps (e.g. every
 * assembly-owned record forged to the same arbitrary future instant) is
 * rejected rather than accepted as "internally consistent". It never trusts
 * each output timestamp independently, and never reads a timestamp back out
 * of `result` to use as its own expected value (which would make the check
 * tautological).
 *
 * Reused both by `profile-assembly` callers that need this check and by the
 * `web-research` orchestrator (which must NOT duplicate this logic itself).
 */
import { buildKrsFactEvidence, buildKrsSource } from "../mappers/toDashboardResponse.ts";
import { arraysEqual } from "../shared/runtimeShape.ts";
import {
  deriveReasons,
  deriveStatus,
  descriptionComponentSourceIds,
} from "./assembleCompanyProfile.ts";
import {
  buildDescriptionEvidence,
  buildWebsiteEvidence,
  evidenceSourceLookup,
  mergeEvidence,
} from "./evidence.ts";
import { ProfileAssemblyInvariantError } from "./errors.ts";
import {
  assertBusinessResearchConsistency,
  resolveConfirmedTarget,
} from "./invariants.ts";
import { canonicalizeBusinessFacts, buildAssembledProfile } from "./profile.ts";
import { buildWebsiteSource, mergeSources, websiteSourceId } from "./sources.ts";
import type { ConfirmedTarget } from "./invariants.ts";
import type { CompanyProfileAssemblyInput, CompanyProfileAssemblyResult } from "./types.ts";
import type { CompanyProfile, FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";
import type { StructuredBusinessFacts } from "../business-research/types.ts";

const fail = (message: string): never => {
  throw new ProfileAssemblyInvariantError(message);
};

function sourceEquals(a: ResearchSource, b: ResearchSource): boolean {
  return (
    a.id === b.id &&
    a.provider === b.provider &&
    a.type === b.type &&
    a.authority === b.authority &&
    a.url === b.url &&
    a.domain === b.domain &&
    a.retrievedAt === b.retrievedAt &&
    a.publishedAt === b.publishedAt
  );
}

function sourceArraysEqual(a: readonly ResearchSource[], b: readonly ResearchSource[]): boolean {
  // An explicit indexed loop — `.every` silently SKIPS holes in a sparse array.
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sourceEquals(a[i], b[i])) return false;
  }
  return true;
}

function evidenceEquals(a: FactEvidence, b: FactEvidence): boolean {
  return (
    a.id === b.id &&
    a.target.path === b.target.path &&
    a.target.itemId === b.target.itemId &&
    arraysEqual(a.sourceIds, b.sourceIds) &&
    a.support === b.support &&
    a.derivation === b.derivation &&
    a.confidence === b.confidence &&
    a.verifiedAt === b.verifiedAt
  );
}

function evidenceArraysEqual(a: readonly FactEvidence[], b: readonly FactEvidence[]): boolean {
  // An explicit indexed loop — `.every` silently SKIPS holes in a sparse array.
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!evidenceEquals(a[i], b[i])) return false;
  }
  return true;
}

function profilesEqual(a: CompanyProfile, b: CompanyProfile): boolean {
  return (
    a.identity.legalName === b.identity.legalName &&
    a.identity.displayName === b.identity.displayName &&
    arraysEqual(a.identity.aliases, b.identity.aliases) &&
    a.identity.countryCode === b.identity.countryCode &&
    a.identity.identifiers.krs === b.identity.identifiers.krs &&
    a.identity.identifiers.nip === b.identity.identifiers.nip &&
    a.identity.identifiers.regon === b.identity.identifiers.regon &&
    a.identity.legalForm === b.identity.legalForm &&
    a.identity.legalStatus === b.identity.legalStatus &&
    a.identity.registrationDate === b.identity.registrationDate &&
    a.identity.foundedYear === b.identity.foundedYear &&
    a.location.city === b.location.city &&
    a.location.region === b.location.region &&
    a.location.countryCode === b.location.countryCode &&
    a.website.url === b.website.url &&
    a.website.domain === b.website.domain &&
    a.website.verified === b.website.verified &&
    a.industry.primaryCode === b.industry.primaryCode &&
    arraysEqual(a.industry.secondaryCodes, b.industry.secondaryCodes) &&
    arraysEqual(a.industry.labels, b.industry.labels) &&
    a.industry.description === b.industry.description &&
    a.business.description === b.business.description &&
    arraysEqual(a.business.productsServices, b.business.productsServices) &&
    arraysEqual(a.business.customerSegments, b.business.customerSegments) &&
    arraysEqual(a.business.operatingMarkets, b.business.operatingMarkets)
  );
}

/**
 * Validates a RAW `CompanyProfileAssemblyResult` against the exact
 * `CompanyProfileAssemblyInput` that (allegedly) produced it. Throws
 * `ProfileAssemblyInvariantError` on the first disagreement — never repairs.
 *
 * `trustedAssembledAt` is the single assembly-clock instant the caller
 * independently observed via a tracked clock wrapper around the SAME `now`
 * Profile Assembly was given (never read back out of `result`). Every
 * assembly-owned timestamp `result` contains is required to equal this exact
 * value wherever the real assembler would have used its clock read.
 */
export function assertProfileAssemblyResultMatchesInputs(
  input: CompanyProfileAssemblyInput,
  result: CompanyProfileAssemblyResult,
  trustedAssembledAt: string,
): void {
  const { company, domainResolution, businessResearch } = input;

  // Confirmed-domain gate + business-research/confirmed-target consistency —
  // reuses the SAME exhaustive validators `assembleCompanyProfile` itself calls
  // (never duplicated). A non-confirmed resolution retaining confirmed-only
  // fields is already rejected upstream by the domain-resolution raw-shape
  // validator; `resolveConfirmedTarget` re-validates the full confirmed contract
  // when applicable.
  const confirmedTarget: ConfirmedTarget | null =
    domainResolution.status === "confirmed" ? resolveConfirmedTarget(domainResolution) : null;
  assertBusinessResearchConsistency(businessResearch, confirmedTarget);

  const factsAccepted = businessResearch.status === "completed" || businessResearch.status === "partial";
  const acceptedFacts: StructuredBusinessFacts | null = factsAccepted
    ? canonicalizeBusinessFacts(businessResearch.facts)
    : null;

  // 1/2/3 — legal identity, website and business fields, all at once: rebuild the
  // EXACT expected profile with the same pure builder the assembler uses, and
  // compare field-for-field. No extra/missing/altered/manufactured fact survives.
  const { profile: expectedProfile, description } = buildAssembledProfile({
    company,
    confirmedTarget,
    acceptedFacts,
  });
  if (!profilesEqual(result.profile, expectedProfile)) {
    fail("assembled profile disagrees with the deterministic assembly rules");
  }

  // 4 — status.
  const hasConfirmedWebsite = confirmedTarget !== null;
  const expectedStatus = deriveStatus(hasConfirmedWebsite, businessResearch.status);
  if (result.status !== expectedStatus) fail("assembly status disagrees with the deterministic assembly rules");

  // 5 — reasons.
  const expectedReasons = deriveReasons(hasConfirmedWebsite, businessResearch.status, description.text !== null);
  if (!arraysEqual(result.reasons, expectedReasons)) {
    fail("assembly reasons disagree with the deterministic assembly rules");
  }

  // 6/7 — sources + evidence, INCLUDING the exact assembly-clock relationship.
  //
  // The real assembler reads its clock EXACTLY ONCE per invocation
  // (`getAssemblyTimestamp(deps.now)`) and shares that ONE value —
  // `trustedAssembledAt`, supplied by the CALLER from an independently tracked
  // observation of that same clock read — across every record it creates from
  // it this invocation:
  //   - a genuinely NEW confirmed-website source's `retrievedAt`,
  //   - that same website's evidence `verifiedAt` (mirrors the website SOURCE's
  //     own `retrievedAt` — which is the assembly clock only when the source is
  //     NEW; when the website source is REUSED from an upstream business
  //     source, the website evidence instead mirrors THAT source's own
  //     independently-trusted `retrievedAt`, never the assembly clock),
  //   - the description evidence `verifiedAt` (always the assembly clock,
  //     whenever a description was generated at all).
  // This validator NEVER calls `now()` and never manufactures a second
  // timestamp: it builds every expected assembly-owned record directly from
  // `trustedAssembledAt` and compares the FULL expected source/evidence sets
  // against `result` — so any assembly-owned timestamp in `result` that
  // disagrees with the trusted value (even a self-consistent forgery, e.g.
  // every generated record set to the same wrong future instant) fails the
  // resulting `sourceArraysEqual`/`evidenceArraysEqual` comparison below. It
  // never reads a timestamp back out of `result` to build its own expectation.
  const krsSource = buildKrsSource(company);
  const businessSources = businessResearch.sources;

  let reusedWebsiteSource: ResearchSource | null = null;
  let websiteIsNew = false;
  if (confirmedTarget !== null) {
    const wid = websiteSourceId(confirmedTarget.targetOrigin);
    reusedWebsiteSource = businessSources.find((s) => s.id === wid) ?? null;
    websiteIsNew = reusedWebsiteSource === null;
  }

  let expectedWebsiteSource: ResearchSource | null = null;
  if (websiteIsNew) {
    expectedWebsiteSource = buildWebsiteSource(confirmedTarget!.targetOrigin, trustedAssembledAt);
  }
  const expectedSources = mergeSources([
    krsSource,
    ...businessSources,
    ...(expectedWebsiteSource !== null ? [expectedWebsiteSource] : []),
  ]);
  if (!sourceArraysEqual(result.sources, expectedSources)) {
    fail("assembly sources disagree with the deterministic merge rules");
  }

  const krsEvidence = buildKrsFactEvidence(company, krsSource.id, company.retrievedAt);
  const businessEvidence = businessResearch.evidence;
  const lookup = evidenceSourceLookup([...krsEvidence, ...businessEvidence]);

  let expectedWebsiteEvidence: FactEvidence[] = [];
  if (confirmedTarget !== null) {
    const wid = websiteSourceId(confirmedTarget.targetOrigin);
    // The trusted retrievedAt the real assembler would have used for THIS
    // website source: its own (reused, independently-trusted) retrievedAt, or
    // the shared TRUSTED assembly clock for a genuinely new one — never
    // independently re-read from the evidence record under test.
    const websiteSourceRetrievedAt = websiteIsNew ? trustedAssembledAt : reusedWebsiteSource!.retrievedAt;
    expectedWebsiteEvidence = [buildWebsiteEvidence(wid, websiteSourceRetrievedAt)];
  }

  let expectedDescriptionEvidence: FactEvidence[] = [];
  if (description.text !== null) {
    const componentSourceIds = descriptionComponentSourceIds(description, lookup);
    expectedDescriptionEvidence = [buildDescriptionEvidence(componentSourceIds, trustedAssembledAt)];
  }

  const expectedEvidence = mergeEvidence(
    [krsEvidence, businessEvidence, expectedWebsiteEvidence, expectedDescriptionEvidence],
    new Set(expectedSources.map((s) => s.id)),
  );
  if (!evidenceArraysEqual(result.evidence, expectedEvidence)) {
    fail("assembly evidence disagrees with the deterministic merge rules");
  }
}
