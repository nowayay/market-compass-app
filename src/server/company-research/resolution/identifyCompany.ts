import type {
  CompanyDataProvider,
  IdentifyResult,
  NormalizedQuery,
} from "../types";

/**
 * Classifies a legal form to decide whether MarketCompass supports the entity.
 * Natural-person businesses (sole proprietorships / CEIDG) are unsupported and
 * must never have their data processed. Pure and testable.
 *
 * Note: KRS (register of entrepreneurs) does not contain sole proprietorships,
 * so in practice a KRS lookup will not return one — but the classifier and the
 * unsupported status exist for the future name-search flow and as a safeguard.
 */
export function classifyEntityType(
  legalForm: string | undefined,
): "supported" | "natural_person_business" {
  if (!legalForm) return "supported";
  const normalized = legalForm.toLowerCase();
  if (
    normalized.includes("osoba fizyczna") ||
    normalized.includes("osoby fizycznej") ||
    normalized.includes("jednoosobowa dzia") ||
    normalized.includes("sole propriet")
  ) {
    return "natural_person_business";
  }
  return "supported";
}

/**
 * Resolves a normalized query to a company. Stage 1 supports KRS-based lookup
 * only; name-only queries (multi-candidate search) are not yet implemented and
 * resolve to `not_found` rather than fabricating candidates.
 *
 * Provider is injected, so this orchestration step is unit-testable with a fake
 * provider and has no bundler/server-only dependencies.
 */
export async function identifyCompany(
  query: NormalizedQuery,
  provider: CompanyDataProvider,
  signal?: AbortSignal,
): Promise<IdentifyResult> {
  if (query.krs === undefined) {
    // No stable identifier and no name search yet.
    return { kind: "not_found" };
  }

  const company = await provider.fetchByKrs(query.krs, signal);
  if (company === null) {
    return { kind: "not_found" };
  }

  if (classifyEntityType(company.legalForm) === "natural_person_business") {
    // Do not return any of the entity's data.
    return { kind: "unsupported", reason: "natural_person_business" };
  }

  return { kind: "found", company };
}
