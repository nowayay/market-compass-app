import { businessEvidenceId, businessItemId, businessSourceId } from "./ids.ts";
import { canonicalKey } from "./normalizeBusinessFacts.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";
import type { StructuredBusinessFacts } from "./types.ts";

/** Existing-contract target paths for the four researched business facts. */
export const INDUSTRY_DESCRIPTION_PATH = "company.industry.description";
export const PRODUCTS_SERVICES_PATH = "company.business.productsServices";
export const CUSTOMER_SEGMENTS_PATH = "company.business.customerSegments";
export const OPERATING_MARKETS_PATH = "company.business.operatingMarkets";

/**
 * Deterministic business-research confidence. Business facts are retained at the
 * DOMAIN level (not a verified specific page), so the contract's required
 * numeric confidence is a fixed conservative 0.5 — never model-provided.
 */
export const BUSINESS_FACT_CONFIDENCE = 0.5;

/**
 * Builds `ResearchSource` records from validated on-domain origins. IDs are
 * derived from the normalized origin only (NOT from retrievedAt), sorted by
 * origin for determinism.
 */
export function buildBusinessSources(
  origins: readonly string[],
  hostnameByOrigin: (origin: string) => string,
  retrievedAt: string,
): ResearchSource[] {
  return [...new Set(origins)]
    .sort()
    .map((origin) => ({
      id: businessSourceId(origin),
      provider: "openai_web_search" as const,
      type: "official_company_website" as const,
      authority: "primary" as const,
      url: origin, // origin-only
      domain: hostnameByOrigin(origin),
      retrievedAt,
      // No trustworthy publication date is available from a domain-level source.
      publishedAt: null,
    }));
}

/**
 * Builds `FactEvidence` for every retained material fact, referencing all current
 * business-research source ids. Because retained evidence is domain-level rather
 * than a verified specific page:
 *  - `support` is always `corroborating` (never `direct`),
 *  - `confidence` is the deterministic 0.5 (never model-provided),
 *  - list items use the honest `extracted` derivation; the model-authored
 *    `industryDescription` (which may combine multiple website facts) uses
 *    `synthesized` (NEVER `extracted`/`normalized`/`derived`).
 *
 * IDs are stable (path + canonical value / itemId), never array indices; entries
 * are de-duplicated and deterministically ordered.
 */
export function buildBusinessEvidence(
  facts: StructuredBusinessFacts,
  sourceIds: readonly string[],
  verifiedAt: string,
): FactEvidence[] {
  const orderedSourceIds = [...new Set(sourceIds)].sort();
  const evidence: FactEvidence[] = [];
  const seen = new Set<string>();

  const push = (
    path: string,
    itemId: string | null,
    derivation: "extracted" | "synthesized",
  ): void => {
    const id = businessEvidenceId(path, itemId);
    if (seen.has(id)) return;
    seen.add(id);
    evidence.push({
      id,
      target: { path, itemId },
      sourceIds: [...orderedSourceIds],
      support: "corroborating",
      derivation,
      confidence: BUSINESS_FACT_CONFIDENCE,
      verifiedAt,
    });
  };

  if (facts.industryDescription !== null) {
    push(INDUSTRY_DESCRIPTION_PATH, null, "synthesized");
  }
  const addList = (path: string, values: readonly string[]): void => {
    for (const value of values) {
      push(path, businessItemId(path, canonicalKey(value)), "extracted");
    }
  };
  addList(PRODUCTS_SERVICES_PATH, facts.productsServices);
  addList(CUSTOMER_SEGMENTS_PATH, facts.customerSegments);
  addList(OPERATING_MARKETS_PATH, facts.operatingMarkets);

  // Deterministic order: by target path, then itemId (scalars — null — first).
  evidence.sort((a, b) => {
    if (a.target.path !== b.target.path) return a.target.path < b.target.path ? -1 : 1;
    const ai = a.target.itemId ?? "";
    const bi = b.target.itemId ?? "";
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  });
  return evidence;
}
