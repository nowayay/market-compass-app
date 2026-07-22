/**
 * Deterministic `FactEvidence` merging + confirmed-website / description evidence
 * construction.
 *
 * Merging preserves the existing KRS and business-research evidence, deduplicates
 * by stable evidence id, rejects an id reused with conflicting content, rejects a
 * duplicate (target path + itemId) pair, validates that every referenced source id
 * resolves to a returned source, and orders the result canonically. Inputs are
 * never mutated — every retained record is copied.
 */
import { businessEvidenceId } from "../business-research/ids.ts";
import { ProfileAssemblyInvariantError } from "./errors.ts";
import type { FactEvidence, FactSupport } from "../../../contracts/companyResearch.ts";

/** Existing-contract target paths for the two assembly-owned facts. */
export const WEBSITE_URL_PATH = "company.website.url";
export const BUSINESS_DESCRIPTION_PATH = "company.business.description";

/**
 * Deterministic, conservative confidence for the two assembly-owned facts. Both
 * are retained at the ORIGIN level (a confirmed domain / a description derived
 * from domain-level facts), never a verified specific page — so confidence is a
 * fixed 0.5 and never model-provided.
 */
export const ASSEMBLY_FACT_CONFIDENCE = 0.5;

/** A returned copy of an evidence record (fresh object + fresh sourceIds array). */
export function cloneEvidence(evidence: FactEvidence): FactEvidence {
  return {
    id: evidence.id,
    target: { path: evidence.target.path, itemId: evidence.target.itemId },
    sourceIds: [...evidence.sourceIds],
    support: evidence.support,
    derivation: evidence.derivation,
    confidence: evidence.confidence,
    verifiedAt: evidence.verifiedAt,
  };
}

/** Stable key for a (path, itemId) target pair. */
function targetKey(evidence: FactEvidence): string {
  return `${evidence.target.path} ${evidence.target.itemId ?? ""}`;
}

/** Sorted, de-duplicated source ids (order-independent content for equality). */
function sortedSourceIds(sourceIds: readonly string[]): string[] {
  return [...new Set(sourceIds)].sort();
}

/** Structural equality across every field (sourceIds compared order-independently). */
function evidenceEqual(a: FactEvidence, b: FactEvidence): boolean {
  if (
    a.id !== b.id ||
    a.target.path !== b.target.path ||
    a.target.itemId !== b.target.itemId ||
    a.support !== b.support ||
    a.derivation !== b.derivation ||
    a.confidence !== b.confidence ||
    a.verifiedAt !== b.verifiedAt
  ) {
    return false;
  }
  const as = sortedSourceIds(a.sourceIds);
  const bs = sortedSourceIds(b.sourceIds);
  return as.length === bs.length && as.every((id, i) => id === bs[i]);
}

/**
 * Builds evidence for the confirmed website (`company.website.url`). Because the
 * retained proof is origin-level (a confirmed official domain), not a specific
 * page, `support` is `corroborating` (never `direct`). The confirmed URL is the
 * domain reduced to its canonical origin form, so the honest derivation is
 * `normalized` (never `extracted`/`registry`/`synthesized`/`derived`).
 */
export function buildWebsiteEvidence(websiteSourceId: string, verifiedAt: string): FactEvidence {
  return {
    id: businessEvidenceId(WEBSITE_URL_PATH, null),
    target: { path: WEBSITE_URL_PATH, itemId: null },
    sourceIds: [websiteSourceId],
    support: "corroborating",
    derivation: "normalized",
    confidence: ASSEMBLY_FACT_CONFIDENCE,
    verifiedAt,
  };
}

/**
 * Builds evidence for the deterministic description (`company.business.description`).
 * The description is composed by application code from other accepted facts, so its
 * derivation is honestly `derived` (never `extracted`/`synthesized` — the model did
 * not author it), `support` is `corroborating`, and `sourceIds` is exactly the union
 * of the sources backing the material facts the description actually rendered.
 */
export function buildDescriptionEvidence(
  componentSourceIds: readonly string[],
  verifiedAt: string,
): FactEvidence {
  const sourceIds = sortedSourceIds(componentSourceIds);
  if (sourceIds.length === 0) {
    throw new ProfileAssemblyInvariantError("description evidence without any component source");
  }
  return {
    id: businessEvidenceId(BUSINESS_DESCRIPTION_PATH, null),
    target: { path: BUSINESS_DESCRIPTION_PATH, itemId: null },
    sourceIds,
    support: "corroborating" satisfies FactSupport,
    derivation: "derived",
    confidence: ASSEMBLY_FACT_CONFIDENCE,
    verifiedAt,
  };
}

/**
 * Builds a lookup from a target (path, itemId) to the source ids that back it,
 * across the supplied evidence. Used to assemble the description evidence's
 * component sources from the KRS + business evidence.
 */
export function evidenceSourceLookup(evidence: readonly FactEvidence[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of evidence) map.set(targetKey(e), [...e.sourceIds]);
  return map;
}

/**
 * Merges evidence groups into one deduplicated, canonically ordered list with full
 * referential integrity. Throws on: an id reused with conflicting content, a
 * duplicate (path, itemId) target pair, or a source id that does not resolve to a
 * returned source. Ordering is by (path, itemId, id), independent of input order.
 * Inputs are copied, never mutated.
 */
export function mergeEvidence(
  groups: ReadonlyArray<readonly FactEvidence[]>,
  validSourceIds: ReadonlySet<string>,
): FactEvidence[] {
  const byId = new Map<string, FactEvidence>();
  const targets = new Set<string>();

  for (const group of groups) {
    for (const evidence of group) {
      // Non-empty, duplicate-free provenance. A duplicate source id is malformed
      // provenance, not something to silently dedup.
      if (evidence.sourceIds.length === 0) {
        throw new ProfileAssemblyInvariantError("evidence without any source id");
      }
      if (new Set(evidence.sourceIds).size !== evidence.sourceIds.length) {
        throw new ProfileAssemblyInvariantError("evidence with duplicate source ids");
      }
      // Referential integrity: every source id must resolve to a returned source.
      for (const sid of evidence.sourceIds) {
        if (!validSourceIds.has(sid)) {
          throw new ProfileAssemblyInvariantError("evidence references a missing source");
        }
      }
      const existing = byId.get(evidence.id);
      if (existing !== undefined) {
        if (!evidenceEqual(existing, evidence)) {
          throw new ProfileAssemblyInvariantError("conflicting duplicate evidence id");
        }
        continue; // identical duplicate → dedup
      }
      const key = targetKey(evidence);
      if (targets.has(key)) {
        throw new ProfileAssemblyInvariantError("duplicate evidence target/item pair");
      }
      targets.add(key);
      byId.set(evidence.id, cloneEvidence(evidence));
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.target.path !== b.target.path) return a.target.path < b.target.path ? -1 : 1;
    const ai = a.target.itemId ?? "";
    const bi = b.target.itemId ?? "";
    if (ai !== bi) return ai < bi ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
