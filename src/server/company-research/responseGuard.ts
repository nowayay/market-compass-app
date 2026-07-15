import { companyResearchResponseSchema } from "../../contracts/companyResearchSchema.ts";
import type { CompanyResearchResponse } from "../../contracts/companyResearch.ts";
import { CompanyResearchInternalError } from "./errors.ts";
import { assertNoPersonalData } from "./privacy/assertNoPersonalData.ts";

/**
 * Final safety gate applied to EVERY domain response before it leaves the
 * server. Two independent layers over the *entire* payload (not just
 * `company`): the personal-data regression assertion, then strict schema
 * validation. Strict schemas + the allowlist remain the primary protection; the
 * assertion is defense-in-depth.
 *
 * A failure here indicates a server-side regression (e.g. a mapper leaking a
 * personal field into `sources`/`warnings`/`expansionInputs`, or an off-contract
 * shape) and is surfaced as a generic internal error — never the raw payload.
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
  return parsed.data;
}
