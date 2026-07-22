import { companyDashboardResponseSchema } from "../../../contracts/companyDashboardSchema.ts";
import type { CompanyDashboardResponse } from "../../../contracts/companyDashboard.ts";
import { CompanyResearchInternalError } from "../errors.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";

/**
 * Final safety gate applied to every Dashboard response before it leaves the
 * server: the personal-data regression assertion, then strict schema
 * validation. Mirrors `responseGuard.ts` for the (structurally different)
 * public dashboard contract.
 *
 * A failure here indicates a server-side regression and is surfaced as a
 * generic internal error — never the raw payload or the offending reason.
 */
export function guardAndValidateDashboardResponse(
  response: CompanyDashboardResponse,
): CompanyDashboardResponse {
  try {
    assertNoPersonalData(response, "dashboardResponse");
  } catch (cause) {
    throw new CompanyResearchInternalError("Final dashboard response failed personal-data guard", cause);
  }

  const parsed = companyDashboardResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new CompanyResearchInternalError("Final dashboard response failed contract validation");
  }

  return parsed.data;
}
