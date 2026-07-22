/**
 * Strict runtime-shape validation for the RAW `StructuredBusinessResearchResult`
 * a `researchCompanyBusiness` dependency returns, BEFORE it is trusted, privacy-
 * checked or cloned. An injected dependency (production closure or test stub) is
 * untrusted input: this rejects an unexpected/hostile field (e.g. a smuggled
 * `contactPerson`, `sourceSnippet`, exact page URL) instead of a permissive
 * clone silently discarding it, and validates every declared origin field
 * directly with the existing origin-safety primitive.
 *
 * All object/array reads go through `assertExactOwnShape`/`assertDenseArray`
 * (own-property-only, sparse-array-rejecting) — see `shared/runtimeShape.ts`.
 * Every returned value is a FRESH object/array, never the original input.
 */
import {
  arraysEqual,
  assertDenseArray,
  assertExactOwnShape,
  isOriginOnlyUrl,
} from "../shared/runtimeShape.ts";
import {
  assertValidFactEvidenceArrayShape,
  assertValidResearchSourceArrayShape,
} from "../shared/researchRecordShape.ts";
import { normalizeText } from "./normalizeBusinessFacts.ts";
import { BusinessResearchInvariantError } from "./errors.ts";
import { orderBusinessConflicts, orderBusinessReasons } from "./reasonCodes.ts";
import type { StructuredBusinessFacts, StructuredBusinessResearchResult } from "./types.ts";
import type { BusinessResearchConflictCode, BusinessResearchReasonCode } from "./reasonCodes.ts";

const fail = (message: string): never => {
  throw new BusinessResearchInvariantError(message);
};

const STATUSES = new Set(["completed", "partial", "unverified", "skipped"]);
const RESULT_KEYS = ["status", "researchedOrigin", "facts", "sources", "evidence", "reasons", "conflicts"];
const FACTS_KEYS = ["industryDescription", "productsServices", "customerSegments", "operatingMarkets"];

/** A materially non-empty string already in the accepted normalized form. */
function isMaterialNormalizedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && normalizeText(value) === value;
}

function assertNormalizedStringArray(value: unknown, context: string): string[] {
  return assertDenseArray(
    value,
    (item) => {
      if (!isMaterialNormalizedString(item)) fail(`${context} is not an array of normalized non-empty strings`);
      return item as string;
    },
    fail,
    context,
  );
}

function assertValidFactsShape(value: unknown): StructuredBusinessFacts {
  const f = assertExactOwnShape(value, FACTS_KEYS, fail, "business facts");

  const industryDescription = f.get("industryDescription");
  if (industryDescription !== null && !isMaterialNormalizedString(industryDescription)) {
    fail("business industryDescription is neither null nor a normalized non-empty string");
  }
  const productsServices = assertNormalizedStringArray(f.get("productsServices"), "business productsServices");
  const customerSegments = assertNormalizedStringArray(f.get("customerSegments"), "business customerSegments");
  const operatingMarkets = assertNormalizedStringArray(f.get("operatingMarkets"), "business operatingMarkets");

  return {
    industryDescription: industryDescription as string | null,
    productsServices,
    customerSegments,
    operatingMarkets,
  };
}

/**
 * Validates the COMPLETE raw runtime shape of a `StructuredBusinessResearchResult`
 * and returns a FRESH result (never the original input). Throws
 * `BusinessResearchInvariantError` on the first violation.
 */
export function assertValidBusinessResearchResultShape(value: unknown): StructuredBusinessResearchResult {
  const r = assertExactOwnShape(value, RESULT_KEYS, fail, "business research result");

  const statusRaw = r.get("status");
  if (typeof statusRaw !== "string" || !STATUSES.has(statusRaw)) fail("business research status is invalid");
  const status = statusRaw as StructuredBusinessResearchResult["status"];
  const accepted = status === "completed" || status === "partial";

  const researchedOriginRaw = r.get("researchedOrigin");
  if (researchedOriginRaw !== null && !isOriginOnlyUrl(researchedOriginRaw)) {
    fail("business research researchedOrigin is neither null nor origin-only");
  }
  if (accepted && researchedOriginRaw === null) fail("accepted business research is missing a researchedOrigin");
  if (!accepted && researchedOriginRaw !== null) fail("non-accepted business research carries a researchedOrigin");

  const facts = assertValidFactsShape(r.get("facts"));
  const sources = assertValidResearchSourceArrayShape(r.get("sources"), fail);
  const evidence = assertValidFactEvidenceArrayShape(r.get("evidence"), fail);

  const reasons = assertDenseArray(
    r.get("reasons"),
    (item) => item as BusinessResearchReasonCode,
    fail,
    "business research reasons",
  );
  if (!arraysEqual(orderBusinessReasons(reasons), reasons)) {
    fail("business research reasons is not a canonical closed-enum set");
  }

  const conflicts = assertDenseArray(
    r.get("conflicts"),
    (item) => item as BusinessResearchConflictCode,
    fail,
    "business research conflicts",
  );
  if (!arraysEqual(orderBusinessConflicts(conflicts), conflicts)) {
    fail("business research conflicts is not a canonical closed-enum set");
  }

  return {
    status,
    researchedOrigin: researchedOriginRaw as string | null,
    facts,
    sources,
    evidence,
    reasons,
    conflicts,
  };
}
