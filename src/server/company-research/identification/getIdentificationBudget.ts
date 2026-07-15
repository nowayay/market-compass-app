import "server-only";
import { getCompanyResearchConfig } from "../config";
import { createIdentificationBudget } from "./identificationBudget";
import type { IdentificationBudget } from "./identificationBudget";

/**
 * Process-wide singleton identification budget, built from configuration. Kept
 * as a singleton so the window/concurrency limits are shared across all requests
 * handled by this process.
 */
let singleton: IdentificationBudget | null = null;

export function getIdentificationBudget(): IdentificationBudget {
  if (!singleton) {
    const config = getCompanyResearchConfig();
    singleton = createIdentificationBudget({
      enabled: config.identificationEnabled,
      windowMs: config.identificationWindowMs,
      maxPerWindow: config.identificationMaxPerWindow,
      maxConcurrent: config.identificationMaxConcurrent,
    });
  }
  return singleton;
}
