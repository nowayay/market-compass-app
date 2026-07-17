/**
 * Strict internal enums for the deterministic Company Profile Assembly stage.
 *
 * Assembly is INTERNAL: it merges a KRS-confirmed company, an internal domain
 * resolution result and an internal business-research result into ONE
 * deterministic company profile. These codes carry NO company names, URLs, facts
 * or raw values, and are NOT part of the public Company Research contract.
 */

/** Reasons attached to a profile-assembly result. */
export type CompanyProfileAssemblyReasonCode =
  | "KRS_PROFILE_PRESENT"
  | "WEBSITE_CONFIRMED"
  | "WEBSITE_NOT_CONFIRMED"
  | "BUSINESS_FACTS_COMPLETE"
  | "BUSINESS_FACTS_PARTIAL"
  | "BUSINESS_FACTS_UNVERIFIED"
  | "BUSINESS_RESEARCH_SKIPPED"
  | "DESCRIPTION_GENERATED"
  | "DESCRIPTION_OMITTED";

/** Canonical ordering so a result's `reasons` array is fully deterministic. */
export const ASSEMBLY_REASON_ORDER: readonly CompanyProfileAssemblyReasonCode[] = [
  "KRS_PROFILE_PRESENT",
  "WEBSITE_CONFIRMED",
  "WEBSITE_NOT_CONFIRMED",
  "BUSINESS_FACTS_COMPLETE",
  "BUSINESS_FACTS_PARTIAL",
  "BUSINESS_FACTS_UNVERIFIED",
  "BUSINESS_RESEARCH_SKIPPED",
  "DESCRIPTION_GENERATED",
  "DESCRIPTION_OMITTED",
];

/** Deterministically orders + de-duplicates a set of assembly reasons. */
export function orderAssemblyReasons(
  reasons: Iterable<CompanyProfileAssemblyReasonCode>,
): CompanyProfileAssemblyReasonCode[] {
  const set = new Set(reasons);
  return ASSEMBLY_REASON_ORDER.filter((r) => set.has(r));
}
