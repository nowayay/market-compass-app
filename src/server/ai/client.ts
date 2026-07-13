import "server-only";
import OpenAI from "openai";
import { getAIConfig } from "./config";

// Interactive app, but the target is a reasoning model whose responses can
// legitimately take well over a minute. 120s gives that latency room to
// resolve while still bounding a hung request rather than waiting forever.
const REQUEST_TIMEOUT_MS = 120_000;
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
