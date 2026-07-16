import { companyResearchResponseSchema } from "../../contracts/companyResearchSchema.ts";
import type { CompanyResearchResponse } from "../../contracts/companyResearch.ts";
import { CompanyResearchInternalError } from "./errors.ts";
import { assertNoPersonalData } from "./privacy/assertNoPersonalData.ts";
import { findResponseIntegrityViolation } from "./semanticResponseGuard.ts";

/**
 * Final safety gate applied to EVERY domain response before it leaves the
 * server. Three independent layers over the *entire* payload (not just
 * `company`): the personal-data regression assertion, strict (per-object) schema
 * validation, then deterministic cross-field semantic validation (referential
 * integrity + the origin-only source-security policy). Strict schemas + the
 * allowlist remain the primary protection; the other layers are defense-in-depth.
 *
 * A failure here indicates a server-side regression (e.g. a mapper leaking a
 * personal field into `sources`/`warnings`/`expansionInputs`, an off-contract
 * shape, or an evidence entry pointing at a non-existent source) and is surfaced
 * as a generic internal error — never the raw payload or the offending reason.
 */
export function guardAndValidateResponse(
  response: CompanyResearchResponse,
): CompanyResearchResponse {
  try {
    assertNoPersonalData(response, "response");
  } catch (cause) {
    // Surface as a generic internal error — never the offending path/value.
    throw new CompanyResearchInternalError("Final response failed personal-data guard", cause);
  }

  const parsed = companyResearchResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new CompanyResearchInternalError("Final response failed contract validation");
  }

  // Cross-field semantic validation over the schema-validated payload. The
  // reason is kept server-side only (it names ids/paths) — never returned.
  const violation = findResponseIntegrityViolation(parsed.data);
  if (violation !== null) {
    throw new CompanyResearchInternalError(`Final response failed integrity check: ${violation}`);
  }

  return parsed.data;
}
