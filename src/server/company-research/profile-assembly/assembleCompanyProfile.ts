import {
  CUSTOMER_SEGMENTS_PATH,
  INDUSTRY_DESCRIPTION_PATH,
  OPERATING_MARKETS_PATH,
  PRODUCTS_SERVICES_PATH,
} from "../business-research/buildBusinessEvidence.ts";
import { businessItemId } from "../business-research/ids.ts";
import { canonicalKey } from "../business-research/normalizeBusinessFacts.ts";
import { buildKrsFactEvidence, buildKrsSource } from "../mappers/toDashboardResponse.ts";
import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import { cloneCompanyProfile } from "./clone.ts";
import { ProfileAssemblyInvariantError, ProfileAssemblyPrivacyError } from "./errors.ts";
import {
  buildDescriptionEvidence,
  buildWebsiteEvidence,
  evidenceSourceLookup,
  mergeEvidence,
} from "./evidence.ts";
import {
  assertBusinessResearchConsistency,
  assertNoExactPageUrl,
  assertValidKrsCompany,
  getAssemblyTimestamp,
  resolveConfirmedTarget,
} from "./invariants.ts";
import { buildAssembledProfile, canonicalizeBusinessFacts } from "./profile.ts";
import { orderAssemblyReasons } from "./reasonCodes.ts";
import { buildWebsiteSource, mergeSources, websiteSourceId } from "./sources.ts";
import type { CompanyProfileAssemblyReasonCode } from "./reasonCodes.ts";
import type {
  AssembleCompanyProfileDeps,
  CompanyProfileAssemblyInput,
  CompanyProfileAssemblyResult,
  CompanyProfileAssemblyStatus,
} from "./types.ts";
import type { DescriptionBuild } from "./description.ts";
import type { ConfirmedTarget } from "./invariants.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";

const LEGAL_NAME_PATH = "company.identity.legalName";

/** Runs the privacy assertion, converting a leak into a strict assembly error. */
function guardPersonalData(value: unknown, path: string): void {
  try {
    assertNoPersonalData(value, path);
  } catch (cause) {
    if (cause instanceof PersonalDataLeakError) {
      throw new ProfileAssemblyPrivacyError(undefined, cause);
    }
    throw cause;
  }
}

/** The evidence-lookup key for a (path, itemId) target (matches evidence.ts). */
function lookupKey(path: string, itemId: string | null): string {
  return `${path} ${itemId ?? ""}`;
}

/**
 * The union of source ids backing the material facts the description actually
 * rendered — nothing else. Deterministic, so the description evidence references
 * only its component facts' sources.
 *
 * Exported so a strict cross-stage result validator (e.g. an internal caller that
 * re-derives the exact expected evidence set from a raw `CompanyProfileAssemblyInput`)
 * can reuse this exact rule instead of duplicating it. Still an internal helper —
 * not part of any public contract.
 */
export function descriptionComponentSourceIds(
  description: DescriptionBuild,
  lookup: Map<string, string[]>,
): string[] {
  const ids = new Set<string>();
  const add = (path: string, itemId: string | null): void => {
    const found = lookup.get(lookupKey(path, itemId));
    if (found !== undefined) for (const id of found) ids.add(id);
  };
  if (description.usedLegalName) add(LEGAL_NAME_PATH, null);
  if (description.usedIndustry) add(INDUSTRY_DESCRIPTION_PATH, null);
  for (const value of description.usedProducts) {
    add(PRODUCTS_SERVICES_PATH, businessItemId(PRODUCTS_SERVICES_PATH, canonicalKey(value)));
  }
  for (const value of description.usedSegments) {
    add(CUSTOMER_SEGMENTS_PATH, businessItemId(CUSTOMER_SEGMENTS_PATH, canonicalKey(value)));
  }
  for (const value of description.usedMarkets) {
    add(OPERATING_MARKETS_PATH, businessItemId(OPERATING_MARKETS_PATH, canonicalKey(value)));
  }
  return [...ids];
}

/**
 * Derives the overall assembly status (see the type doc).
 *
 * Exported so a strict cross-stage result validator can recompute the exact
 * expected status from the same two inputs and compare — without re-running
 * (or duplicating) `assembleCompanyProfile` itself.
 */
export function deriveStatus(
  hasConfirmedWebsite: boolean,
  businessStatus: CompanyProfileAssemblyInput["businessResearch"]["status"],
): CompanyProfileAssemblyStatus {
  const hasFacts = businessStatus === "completed" || businessStatus === "partial";
  if (businessStatus === "completed" && hasConfirmedWebsite) return "complete";
  if (!hasConfirmedWebsite && !hasFacts) return "legal_only";
  return "partial";
}

/**
 * Derives the deterministic, canonically ordered reason set.
 *
 * Exported for the same reason as `deriveStatus` above.
 */
export function deriveReasons(
  hasConfirmedWebsite: boolean,
  businessStatus: CompanyProfileAssemblyInput["businessResearch"]["status"],
  descriptionPresent: boolean,
): CompanyProfileAssemblyReasonCode[] {
  const reasons: CompanyProfileAssemblyReasonCode[] = ["KRS_PROFILE_PRESENT"];
  reasons.push(hasConfirmedWebsite ? "WEBSITE_CONFIRMED" : "WEBSITE_NOT_CONFIRMED");
  switch (businessStatus) {
    case "completed":
      reasons.push("BUSINESS_FACTS_COMPLETE");
      break;
    case "partial":
      reasons.push("BUSINESS_FACTS_PARTIAL");
      break;
    case "unverified":
      reasons.push("BUSINESS_FACTS_UNVERIFIED");
      break;
    case "skipped":
      reasons.push("BUSINESS_RESEARCH_SKIPPED");
      break;
  }
  reasons.push(descriptionPresent ? "DESCRIPTION_GENERATED" : "DESCRIPTION_OMITTED");
  return orderAssemblyReasons(reasons);
}

/**
 * The deterministic Company Profile Assembly stage.
 *
 * Merges a KRS-confirmed company, an internal domain-resolution result and an
 * internal structured business-research result into ONE deterministic internal
 * company profile plus merged, referentially valid origin-only sources and
 * evidence, a deterministic description, and a strict internal result.
 *
 * It performs NO network calls, touches no budget/provider, and never calls domain
 * resolution or business research. KRS stays authoritative for legal data; web
 * research may populate only the confirmed website and the four allowed business
 * facts. Impossible internal states throw a strict assembly error (never a silent
 * repair or downgrade). The returned result is fully detached from every input and
 * passes the personal-data guard.
 */
export function assembleCompanyProfile(
  input: CompanyProfileAssemblyInput,
  deps: AssembleCompanyProfileDeps,
): CompanyProfileAssemblyResult {
  const { company, domainResolution, businessResearch } = input;

  // 1. KRS legal base must satisfy the complete runtime shape the mappers consume.
  assertValidKrsCompany(company);

  // 2. Confirmed-domain gate: only a fully-validated confirmed resolution yields a
  //    usable website target. An impossible confirmed state throws (never a
  //    silent unverified-website downgrade).
  const confirmedTarget: ConfirmedTarget | null =
    domainResolution.status === "confirmed" ? resolveConfirmedTarget(domainResolution) : null;

  // 3. Business-research contribution must be internally consistent: accepted facts
  //    require the confirmed target + status/category completeness + valid
  //    origin-only sources and non-empty/unique evidence provenance; unverified/
  //    skipped research can never smuggle a fact.
  assertBusinessResearchConsistency(businessResearch, confirmedTarget);

  const factsAccepted =
    businessResearch.status === "completed" || businessResearch.status === "partial";
  // (D) Canonically order the accepted list facts once, so the profile arrays, the
  //     description, the displayed examples and the description evidence all agree.
  const acceptedFacts = factsAccepted ? canonicalizeBusinessFacts(businessResearch.facts) : null;

  // 4. Build the profile (KRS base + website + the four allowed business facts) and
  //    the deterministic description.
  const { profile, description } = buildAssembledProfile({ company, confirmedTarget, acceptedFacts });

  // 5. Merge sources — KRS + business (accepted only) + confirmed-website source.
  //    Reuse a business source for the confirmed origin when one exists; otherwise
  //    create one with the injected clock (its id is retrievedAt-independent).
  //    The clock is read ONCE (guarded), and this single validated canonical ISO
  //    value is shared by every assembly-created record this invocation.
  const assembledAt = getAssemblyTimestamp(deps.now);
  const krsSource = buildKrsSource(company);
  const businessSources = businessResearch.sources;

  let websiteSource: ResearchSource | null = null;
  let newWebsiteSource: ResearchSource | null = null;
  if (confirmedTarget !== null) {
    const wid = websiteSourceId(confirmedTarget.targetOrigin);
    const reused = businessSources.find((s) => s.id === wid) ?? null;
    if (reused !== null) {
      // A source reused as the confirmed website must exactly represent the
      // canonical confirmed origin — a matching id alone is not enough. (Every
      // business source was already fully validated in step 3.)
      if (reused.url !== confirmedTarget.targetOrigin) {
        throw new ProfileAssemblyInvariantError("reused website source url is not the confirmed origin");
      }
      websiteSource = reused;
    } else {
      newWebsiteSource = buildWebsiteSource(confirmedTarget.targetOrigin, assembledAt);
      websiteSource = newWebsiteSource;
    }
  }

  const mergedSources = mergeSources([
    krsSource,
    ...businessSources,
    ...(newWebsiteSource !== null ? [newWebsiteSource] : []),
  ]);
  const validSourceIds = new Set(mergedSources.map((s) => s.id));

  // 6. Merge evidence — preserve KRS + business evidence; add website + description
  //    evidence. The description references only the sources of the facts it used.
  const krsEvidence = buildKrsFactEvidence(company, krsSource.id, company.retrievedAt);
  const businessEvidence = businessResearch.evidence;
  const lookup = evidenceSourceLookup([...krsEvidence, ...businessEvidence]);

  const websiteEvidence: FactEvidence[] =
    websiteSource !== null
      ? [buildWebsiteEvidence(websiteSource.id, websiteSource.retrievedAt)]
      : [];

  const descriptionEvidence: FactEvidence[] =
    description.text !== null
      ? [buildDescriptionEvidence(descriptionComponentSourceIds(description, lookup), assembledAt)]
      : [];

  const mergedEvidence = mergeEvidence(
    [krsEvidence, businessEvidence, websiteEvidence, descriptionEvidence],
    validSourceIds,
  );

  // 7. Final structural invariant — no exact page URL survives on the profile.
  assertNoExactPageUrl(profile);

  // 8. Status + reasons.
  const status = deriveStatus(confirmedTarget !== null, businessResearch.status);
  const reasons = deriveReasons(
    confirmedTarget !== null,
    businessResearch.status,
    description.text !== null,
  );

  // 9. Fully detach from every input (profile deep-cloned; sources/evidence already
  //    copied by the merge helpers; reasons a fresh array).
  const result: CompanyProfileAssemblyResult = {
    status,
    profile: cloneCompanyProfile(profile),
    sources: mergedSources,
    evidence: mergedEvidence,
    reasons,
  };

  // 10. Final privacy guard (fail-closed). The profile is guarded under a `company`
  //     root so KRS-verified legal names remain on their approved legal-name path.
  guardPersonalData(result.profile, "company");
  guardPersonalData(
    { status: result.status, sources: result.sources, evidence: result.evidence, reasons: result.reasons },
    "companyProfileAssemblyResult",
  );

  return result;
}
