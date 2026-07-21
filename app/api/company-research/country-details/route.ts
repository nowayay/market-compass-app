import { handleCountryDetails } from "@/src/server/ai/countryDetails/httpHandler";
import { createCountryDetailsProvider } from "@/src/server/ai/countryDetails/countryDetailsProvider";
import { clientIpFrom, createSimpleRateLimiter } from "@/src/server/rateLimit/simpleRateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One bounded OpenAI call; comfortably under the platform default, but pin a
// generous ceiling so a slow model response is not cut off by the platform.
export const maxDuration = 120;

/**
 * Process-local per-IP guard for the on-demand country deep-dive. A little more
 * generous than the main research endpoint since a user may open several
 * countries in a session; results are cached in the browser so repeat opens do
 * not hit this at all.
 */
const rateLimiter = createSimpleRateLimiter({ windowMs: 5 * 60 * 1000, maxPerWindow: 40 });

function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { code: "RATE_LIMITED", message: "Zbyt wiele żądań. Spróbuj ponownie za chwilę." } }),
    {
      status: 429,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}

/**
 * Thin transport wrapper: supply the production OpenAI-backed country-details
 * provider, then delegate to the testable handler. All logic lives in
 * `handleCountryDetails` / `createOpenAiCountryDetailsProvider`.
 */
export async function POST(request: Request): Promise<Response> {
  if (!rateLimiter.allow(clientIpFrom(request))) {
    return rateLimitedResponse();
  }
  return handleCountryDetails(request, { provider: createCountryDetailsProvider() });
}
