/**
 * Explicit deep-clone helpers that fully DETACH the combined Full Company Web
 * Research result from every upstream stage-call return value.
 *
 * Each individual stage (domain resolution / business research / profile
 * assembly) already returns a result detached from ITS OWN inputs. But this
 * orchestrator holds the exact object references those stage calls returned, and
 * a caller-held reference to the same objects (e.g. a test capturing the stub's
 * return value) must never be mutated by mutating the field on the combined
 * result. So every section is cloned again here, one level up, reusing the
 * existing per-field clone helpers wherever available — no
 * `JSON.parse(JSON.stringify(...))`, no repository-wide readonly refactor.
 */
import {
  cloneDomainConfirmationResult,
  cloneEvaluatedDomainCandidate,
  cloneEvaluatedDomainCandidates,
} from "../domain-resolution/clone.ts";
import { cloneCompanyProfile } from "../profile-assembly/clone.ts";
import { cloneEvidence } from "../profile-assembly/evidence.ts";
import { cloneSource } from "../profile-assembly/sources.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type {
  StructuredBusinessFacts,
  StructuredBusinessResearchResult,
} from "../business-research/types.ts";
import type { CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";
import type { CompanyWebResearchResult } from "./types.ts";

/** Returns a fully detached copy of a domain-resolution result. */
export function cloneDomainResolutionResult(
  result: CompanyDomainResolutionResult,
): CompanyDomainResolutionResult {
  return {
    status: result.status,
    confirmedOrigin: result.confirmedOrigin,
    selectedCandidate: result.selectedCandidate
      ? cloneEvaluatedDomainCandidate(result.selectedCandidate)
      : null,
    evaluatedCandidates: cloneEvaluatedDomainCandidates(result.evaluatedCandidates),
    confirmation: result.confirmation ? cloneDomainConfirmationResult(result.confirmation) : null,
    reasons: [...result.reasons],
    sourceOrigins: [...result.sourceOrigins],
  };
}

/** Returns a fully detached copy of the structured business-research facts. */
function cloneBusinessFacts(facts: StructuredBusinessFacts): StructuredBusinessFacts {
  return {
    industryDescription: facts.industryDescription,
    productsServices: [...facts.productsServices],
    customerSegments: [...facts.customerSegments],
    operatingMarkets: [...facts.operatingMarkets],
  };
}

/** Returns a fully detached copy of a business-research result. */
export function cloneBusinessResearchResult(
  result: StructuredBusinessResearchResult,
): StructuredBusinessResearchResult {
  return {
    status: result.status,
    researchedOrigin: result.researchedOrigin,
    facts: cloneBusinessFacts(result.facts),
    sources: result.sources.map(cloneSource),
    evidence: result.evidence.map(cloneEvidence),
    reasons: [...result.reasons],
    conflicts: [...result.conflicts],
  };
}

/** Returns a fully detached copy of a profile-assembly result. */
export function cloneProfileAssemblyResult(
  result: CompanyProfileAssemblyResult,
): CompanyProfileAssemblyResult {
  return {
    status: result.status,
    profile: cloneCompanyProfile(result.profile),
    sources: result.sources.map(cloneSource),
    evidence: result.evidence.map(cloneEvidence),
    reasons: [...result.reasons],
  };
}

/**
 * Returns a fully detached copy of the combined pipeline result: mutating any
 * returned section (or a nested array/object within it) can never alias the
 * supplied `KrsCompany`, a captured dependency return object, or a sibling
 * section of the result.
 */
export function cloneCompanyWebResearchResult(
  result: CompanyWebResearchResult,
): CompanyWebResearchResult {
  return {
    domainResolution: cloneDomainResolutionResult(result.domainResolution),
    businessResearch: cloneBusinessResearchResult(result.businessResearch),
    profileAssembly: cloneProfileAssemblyResult(result.profileAssembly),
  };
}
