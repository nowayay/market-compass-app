import { handleCompanyResearchDashboard } from "@/src/server/company-research/httpHandler";
import { createKrsProvider } from "@/src/server/company-research/providers/krsProvider";
import { createOpenAiCompanyIdentificationProvider } from "@/src/server/company-research/providers/openAiCompanyIdentificationProvider";
import { getIdentificationBudget } from "@/src/server/company-research/identification/getIdentificationBudget";
import { createCompanyWebResearchDeps } from "@/src/server/company-research/web-research/createCompanyWebResearchDeps";
import { createExpansionAnalysisProvider } from "@/src/server/company-research/expansion-analysis/expansionAnalysisProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin transport wrapper: supply the production providers (official-host KRS +
 * OpenAI web-search identification), the process-wide identification budget,
 * the internal web-research pipeline deps, and the expansion-analysis
 * provider, then delegate to the testable Dashboard handler. All logic lives
 * in `handleCompanyResearchDashboard` / `researchCompanyDashboard`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleCompanyResearchDashboard(request, {
    krsProvider: createKrsProvider(),
    identificationProvider: createOpenAiCompanyIdentificationProvider(),
    identificationBudget: getIdentificationBudget(),
    webResearchDeps: createCompanyWebResearchDeps(),
    expansionAnalysisProvider: createExpansionAnalysisProvider(),
  });
}
