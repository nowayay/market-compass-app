import "server-only";
import { getBusinessResearchConfig } from "./config";
import { createBusinessResearchBudget } from "./businessResearchBudget";
import type { BusinessResearchBudget } from "./businessResearchBudget";

/**
 * Process-wide singleton business-research budget, built from the dedicated
 * config. Shared across all requests in this process (documented process-local
 * limitation, same as the discovery/confirmation budgets).
 */
let singleton: BusinessResearchBudget | null = null;

export function getBusinessResearchBudget(): BusinessResearchBudget {
  if (!singleton) {
    const config = getBusinessResearchConfig();
    singleton = createBusinessResearchBudget({
      enabled: config.enabled,
      windowMs: config.windowMs,
      maxPerWindow: config.maxPerWindow,
      maxConcurrent: config.maxConcurrent,
    });
  }
  return singleton;
}
