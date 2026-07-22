import "server-only";
import OpenAI from "openai";
import { getAIConfig } from "./config";

// Interactive app, but the target is a reasoning model whose responses can
// legitimately take well over a minute. This client-level ceiling MUST stay
// strictly larger than every per-stage timeout that runs through it — most
// notably the expansion-analysis stage (180s) — so that the stage's own,
// tighter AbortSignal.timeout is always the binding cutoff and this ceiling
// only ever catches a genuinely hung socket. It also stays below the route's
// maxDuration (300s) and the browser's request timeout (290s).
const REQUEST_TIMEOUT_MS = 240_000;
// Default transport retries for latency-tolerant, non-time-critical calls
// (e.g. chat). The company-research stages that must never auto-retry after a
// timeout override this to 0 per call (see the enrichment/expansion providers).
const MAX_RETRIES = 2;

let cachedClient: OpenAI | null = null;

/**
 * Returns a lazily-created, process-wide singleton OpenAI client.
 * Must never be imported from a client component.
 */
export function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    const config = getAIConfig();
    cachedClient = new OpenAI({
      apiKey: config.apiKey,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return cachedClient;
}
