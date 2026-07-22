import { handleCompanyResearchDashboard } from "@/src/server/company-research/httpHandler";
import { createKrsProvider } from "@/src/server/company-research/providers/krsProvider";
import { createOpenAiCompanyIdentificationProvider } from "@/src/server/company-research/providers/openAiCompanyIdentificationProvider";
import { getIdentificationBudget } from "@/src/server/company-research/identification/getIdentificationBudget";
import { createCompanyWebResearchDeps } from "@/src/server/company-research/web-research/createCompanyWebResearchDeps";
import { createExpansionAnalysisProvider } from "@/src/server/company-research/expansion-analysis/expansionAnalysisProvider";
import { createCompanyEnrichmentProvider } from "@/src/server/company-research/enrichment/companyEnrichmentProvider";
import { clientIpFrom, createSimpleRateLimiter } from "@/src/server/rateLimit/simpleRateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The full pipeline (identification + KRS + web research + AI expansion
// analysis) can legitimately run well past a serverless function's default
// timeout; raise it to Vercel's Pro-plan ceiling for this route only.
export const maxDuration = 300;

/**
 * Simple, process-local per-IP guard against hammering this expensive,
 * multi-stage endpoint. NOT a distributed rate limit — see
 * `simpleRateLimiter.ts`. Kept at module scope so the window is shared across
 * every request handled by this warm serverless instance.
 */
const rateLimiter = createSimpleRateLimiter({ windowMs: 5 * 60 * 1000, maxPerWindow: 10 });

function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { code: "RATE_LIMITED", message: "Zbyt wiele żądań. Spróbuj ponownie za kilka minut." } }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * Thin transport wrapper: supply the production providers (official-host KRS +
 * OpenAI web-search identification), the process-wide identification budget,
 * the internal web-research pipeline deps, the expansion-analysis provider,
 * and the optional company-enrichment fallback provider, then delegate to the
 * testable Dashboard handler. All logic lives in
 * `handleCompanyResearchDashboard` / `researchCompanyDashboard`.
 */
export async function POST(request: Request): Promise<Response> {
  if (!rateLimiter.allow(clientIpFrom(request))) {
    return rateLimitedResponse();
  }

  return handleCompanyResearchDashboard(request, {
    krsProvider: createKrsProvider(),
    identificationProvider: createOpenAiCompanyIdentificationProvider(),
    identificationBudget: getIdentificationBudget(),
    webResearchDeps: createCompanyWebResearchDeps(),
    expansionAnalysisProvider: createExpansionAnalysisProvider(),
    enrichmentProvider: createCompanyEnrichmentProvider(),
  });
}
