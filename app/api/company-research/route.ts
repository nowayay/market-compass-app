import { handleCompanyResearch } from "@/src/server/company-research/httpHandler";
import { createKrsProvider } from "@/src/server/company-research/providers/krsProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Thin transport wrapper: supply the production (official-host) KRS provider and
 * delegate to the testable handler. All logic lives in `handleCompanyResearch`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleCompanyResearch(request, createKrsProvider());
}
