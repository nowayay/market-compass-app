import { isTargetHost } from "../domain-confirmation/targetHosts.ts";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import {
  buildBusinessEvidence,
  buildBusinessSources,
} from "./buildBusinessEvidence.ts";
import {
  MARKETS_ITEM_MAX,
  MARKETS_MAX_ITEMS,
  PRODUCTS_ITEM_MAX,
  PRODUCTS_MAX_ITEMS,
  SEGMENTS_ITEM_MAX,
  SEGMENTS_MAX_ITEMS,
  INDUSTRY_DESCRIPTION_MAX,
} from "./schema.ts";
import { normalizeList, normalizeScalar } from "./normalizeBusinessFacts.ts";
import {
  orderBusinessConflicts,
  orderBusinessReasons,
} from "./reasonCodes.ts";
import type {
  BusinessResearchConflictCode,
  BusinessResearchReasonCode,
} from "./reasonCodes.ts";
import type {
  BusinessAmbiguityCode,
  RawBusinessFacts,
  StructuredBusinessFacts,
  StructuredBusinessResearchResult,
} from "./types.ts";

interface AmbiguityOutcome {
  conflicts: Set<BusinessResearchConflictCode>;
  reasons: Set<BusinessResearchReasonCode>;
  entityScope: boolean;
  insufficientEvidence: boolean;
  dropIndustry: boolean;
  dropProducts: boolean;
  dropSegments: boolean;
  dropMarkets: boolean;
  multipleActivities: boolean;
}

/** Deterministically maps model ambiguity codes to conflicts/reasons/drops. */
function mapAmbiguity(codes: readonly BusinessAmbiguityCode[]): AmbiguityOutcome {
  const conflicts = new Set<BusinessResearchConflictCode>();
  const reasons = new Set<BusinessResearchReasonCode>();
  const out: AmbiguityOutcome = {
    conflicts,
    reasons,
    entityScope: false,
    insufficientEvidence: false,
    dropIndustry: false,
    dropProducts: false,
    dropSegments: false,
    dropMarkets: false,
    multipleActivities: false,
  };
  for (const code of codes) {
    switch (code) {
      case "multiple_legal_entities":
        conflicts.add("MULTIPLE_LEGAL_ENTITIES");
        out.entityScope = true;
        break;
      case "group_scope_unclear":
        conflicts.add("GROUP_SCOPE_UNCLEAR");
        out.entityScope = true;
        break;
      case "subsidiary_scope_unclear":
        conflicts.add("SUBSIDIARY_SCOPE_UNCLEAR");
        out.entityScope = true;
        break;
      case "third_party_listing_scope":
        // Deterministic: seller/partner listings are NOT the company's products.
        // Discard the productsServices category; a completed result is impossible.
        conflicts.add("THIRD_PARTY_LISTING_SCOPE");
        out.dropProducts = true;
        break;
      case "contradictory_activities":
        conflicts.add("CONTRADICTORY_ACTIVITIES");
        out.dropIndustry = true;
        break;
      case "contradictory_offerings":
        conflicts.add("CONTRADICTORY_OFFERINGS");
        out.dropProducts = true;
        break;
      case "contradictory_customer_segments":
        conflicts.add("CONTRADICTORY_CUSTOMER_SEGMENTS");
        out.dropSegments = true;
        break;
      case "contradictory_markets":
        conflicts.add("CONTRADICTORY_MARKETS");
        out.dropMarkets = true;
        break;
      case "multiple_business_activities":
        out.multipleActivities = true;
        break;
      case "insufficient_business_evidence":
        // Global fail-closed: discard all facts/evidence regardless of what the
        // model returned (handled below).
        out.insufficientEvidence = true;
        break;
    }
  }
  return out;
}

const EMPTY_FACTS: StructuredBusinessFacts = {
  industryDescription: null,
  productsServices: [],
  customerSegments: [],
  operatingMarkets: [],
};

function cloneFacts(facts: StructuredBusinessFacts): StructuredBusinessFacts {
  return {
    industryDescription: facts.industryDescription,
    productsServices: [...facts.productsServices],
    customerSegments: [...facts.customerSegments],
    operatingMarkets: [...facts.operatingMarkets],
  };
}

/**
 * Pure deterministic assembly of the business-research result from raw provider
 * facts, on-domain attested source origins and a target. No network, no clock
 * side effects (the ISO `researchedAt` is injected). The returned result is fully
 * detached: facts arrays, sources, evidence (+ nested sourceIds), reasons and
 * conflicts are all freshly built here.
 */
export function buildBusinessResult(args: {
  raw: RawBusinessFacts;
  sourceOrigins: readonly string[];
  targetOrigin: string;
  targetDomain: string;
  researchedAt: string;
}): StructuredBusinessResearchResult {
  const ambiguity = mapAmbiguity(args.raw.ambiguityCodes);
  const reasons = new Set(ambiguity.reasons);
  const conflicts = ambiguity.conflicts;
  if (ambiguity.multipleActivities) reasons.add("MULTIPLE_BUSINESS_ACTIVITIES");

  const finish = (
    status: StructuredBusinessResearchResult["status"],
    facts: StructuredBusinessFacts,
    sources: StructuredBusinessResearchResult["sources"],
    evidence: StructuredBusinessResearchResult["evidence"],
    researchedOrigin: string | null,
  ): StructuredBusinessResearchResult => ({
    status,
    researchedOrigin,
    facts: cloneFacts(facts),
    sources,
    evidence,
    reasons: orderBusinessReasons(reasons),
    conflicts: orderBusinessConflicts(conflicts),
  });

  // Entity-scope ambiguity or an explicit insufficient-evidence signal invalidates
  // ALL facts and all evidence (fail-closed), regardless of what was returned.
  if (ambiguity.entityScope) reasons.add("ENTITY_SCOPE_AMBIGUITY");
  if (ambiguity.insufficientEvidence) reasons.add("INSUFFICIENT_BUSINESS_EVIDENCE");
  if (ambiguity.entityScope || ambiguity.insufficientEvidence) {
    return finish("unverified", EMPTY_FACTS, [], [], null);
  }

  // Normalize, then apply category-contradiction drops.
  const facts: StructuredBusinessFacts = {
    industryDescription: ambiguity.dropIndustry
      ? null
      : normalizeScalar(args.raw.industryDescription, INDUSTRY_DESCRIPTION_MAX),
    productsServices: ambiguity.dropProducts
      ? []
      : normalizeList(args.raw.productsServices, PRODUCTS_MAX_ITEMS, PRODUCTS_ITEM_MAX),
    customerSegments: ambiguity.dropSegments
      ? []
      : normalizeList(args.raw.customerSegments, SEGMENTS_MAX_ITEMS, SEGMENTS_ITEM_MAX),
    operatingMarkets: ambiguity.dropMarkets
      ? []
      : normalizeList(args.raw.operatingMarkets, MARKETS_MAX_ITEMS, MARKETS_ITEM_MAX),
  };

  // Re-validate the attested sources (defense-in-depth over the extractor).
  const targetHost = safeOriginFromUrl(args.targetOrigin)?.hostname ?? "";
  const hostnameByOrigin = new Map<string, string>();
  const validOrigins = [...new Set(args.sourceOrigins)]
    .filter((origin) => {
      const safe = safeOriginFromUrl(origin);
      if (safe === null || safe.origin !== origin) return false;
      if (targetHost.length === 0 || !isTargetHost(safe.hostname, args.targetDomain)) return false;
      hostnameByOrigin.set(origin, safe.hostname);
      return true;
    })
    .sort();

  const hasAnyFact =
    facts.industryDescription !== null ||
    facts.productsServices.length > 0 ||
    facts.customerSegments.length > 0 ||
    facts.operatingMarkets.length > 0;

  // No valid attested source → discard all facts, unverified.
  if (validOrigins.length === 0) {
    reasons.add("NO_ATTESTED_SOURCES");
    return finish("unverified", EMPTY_FACTS, [], [], null);
  }

  // Valid structured response but no acceptable facts → unverified.
  if (!hasAnyFact) {
    reasons.add("INSUFFICIENT_BUSINESS_EVIDENCE");
    return finish("unverified", EMPTY_FACTS, [], [], null);
  }

  const sources = buildBusinessSources(
    validOrigins,
    (origin) => hostnameByOrigin.get(origin) ?? "",
    args.researchedAt,
  );
  const sourceIds = sources.map((s) => s.id);
  const evidence = buildBusinessEvidence(facts, sourceIds, args.researchedAt);

  const allFour =
    facts.industryDescription !== null &&
    facts.productsServices.length > 0 &&
    facts.customerSegments.length > 0 &&
    facts.operatingMarkets.length > 0;

  return finish(allFour ? "completed" : "partial", facts, sources, evidence, args.targetOrigin);
}

/** Builds the fixed `skipped` result (non-confirmed domain; no provider call). */
export function buildSkippedResult(): StructuredBusinessResearchResult {
  return {
    status: "skipped",
    researchedOrigin: null,
    facts: cloneFacts(EMPTY_FACTS),
    sources: [],
    evidence: [],
    reasons: ["DOMAIN_NOT_CONFIRMED"],
    conflicts: [],
  };
}
