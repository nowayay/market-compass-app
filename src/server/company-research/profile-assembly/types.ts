/**
 * Internal types for the deterministic Company Profile Assembly stage.
 *
 * Pure types only (no runtime imports) so the leaf logic modules and their tests
 * can depend on this without pulling in any server-only or bundler-only code.
 *
 * Assembly is INTERNAL: it is not wired into the public Company Research API. It
 * REUSES the existing public `CompanyProfile` / `ResearchSource` / `FactEvidence`
 * contracts (no duplicate types) and produces only a minimal internal result
 * wrapper. It performs NO network calls, touches no budget/provider, and never
 * calls domain resolution or business research.
 */
import type {
  CompanyProfile,
  FactEvidence,
  ResearchSource,
} from "../../../contracts/companyResearch.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { StructuredBusinessResearchResult } from "../business-research/types.ts";
import type { KrsCompany } from "../types.ts";
import type { CompanyProfileAssemblyReasonCode } from "./reasonCodes.ts";

/**
 * The internal assembly input. It accepts ONLY the sanitized upstream results:
 * a KRS-confirmed (allowlist-mapped) company, the internal domain-resolution
 * result and the internal structured business-research result. It NEVER accepts
 * raw user input, a raw KRS payload, raw model output, an exact source-page URL,
 * a previous provider request, or any natural-person/contact data.
 */
export interface CompanyProfileAssemblyInput {
  company: KrsCompany;
  domainResolution: CompanyDomainResolutionResult;
  businessResearch: StructuredBusinessResearchResult;
}

/**
 * Injected dependencies. The stage has no network/environment dependency; the
 * clock is used ONLY when it genuinely creates a new `ResearchSource` (the
 * confirmed-website source) that requires a `retrievedAt`.
 */
export interface AssembleCompanyProfileDeps {
  /** Injected clock for a newly created source's `retrievedAt` (determinism). */
  now: () => Date;
}

/**
 * The overall assembly status:
 *  - `complete`   — KRS profile + confirmed website + completed business research,
 *  - `partial`    — KRS profile + some (but not all) web/company business data,
 *  - `legal_only` — valid KRS profile, no accepted web business facts AND no
 *                   usable confirmed website.
 */
export type CompanyProfileAssemblyStatus = "complete" | "partial" | "legal_only";

/**
 * The single internal assembly result. INTERNAL only (no public API wiring). It
 * reuses the existing public `CompanyProfile` / `ResearchSource` / `FactEvidence`
 * contracts and is returned fully DETACHED from every input.
 */
export interface CompanyProfileAssemblyResult {
  status: CompanyProfileAssemblyStatus;
  profile: CompanyProfile;
  sources: ResearchSource[];
  evidence: FactEvidence[];
  reasons: CompanyProfileAssemblyReasonCode[];
}
