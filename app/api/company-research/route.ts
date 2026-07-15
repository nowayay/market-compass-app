import { handleCompanyResearch } from "@/src/server/company-research/httpHandler";
import { createKrsProvider } from "@/src/server/company-research/providers/krsProvider";
import { createOpenAiCompanyIdentificationProvider } from "@/src/server/company-research/providers/openAiCompanyIdentificationProvider";
import { getIdentificationBudget } from "@/src/server/company-research/identification/getIdentificationBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin transport wrapper: supply the production providers (official-host KRS +
 * OpenAI web-search identification) and the process-wide identification budget,
 * then delegate to the testable handler. All logic lives in
 * `handleCompanyResearch`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleCompanyResearch(request, {
    krsProvider: createKrsProvider(),
    identificationProvider: createOpenAiCompanyIdentificationProvider(),
    identificationBudget: getIdentificationBudget(),
  });
}
