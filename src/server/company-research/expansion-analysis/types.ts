/**
 * Internal types for the AI Expansion Analysis stage.
 *
 * Pure types only (no runtime imports) so the provider and its tests can depend
 * on this without pulling in any server-only or bundler-only code. This stage
 * reuses the existing public `ExpansionAnalysis` contract (no duplicate type).
 */
import type { ExpansionAnalysis } from "../../../contracts/companyDashboard.ts";

/** The privacy-safe input sent to the model — company-as-entity facts only. */
export interface ExpansionAnalysisInput {
  legalName: string;
  countryCode: string;
  city?: string;
  industry?: string;
  description?: string;
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}

/**
 * One structured AI call that turns an assembled company profile into a SWOT
 * analysis plus a 15-country expansion ranking. Implementations must never
 * accept or return natural-person data, invented financial figures, or legal/
 * tax guarantees.
 */
export interface ExpansionAnalysisProvider {
  readonly name: string;
  analyze(input: ExpansionAnalysisInput, options?: { signal?: AbortSignal }): Promise<ExpansionAnalysis>;
}
