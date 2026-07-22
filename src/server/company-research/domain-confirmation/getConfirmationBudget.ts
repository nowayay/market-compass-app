import "server-only";
import { getDomainConfirmationConfig } from "./config";
import { createDomainConfirmationBudget } from "./confirmationBudget";
import type { DomainConfirmationBudget } from "./confirmationBudget";

/**
 * Process-wide singleton domain-confirmation budget, built from the dedicated
 * config. Shared across all requests in this process (documented process-local
 * limitation, same as the discovery/identification budgets).
 */
let singleton: DomainConfirmationBudget | null = null;

export function getConfirmationBudget(): DomainConfirmationBudget {
  if (!singleton) {
    const config = getDomainConfirmationConfig();
    singleton = createDomainConfirmationBudget({
      enabled: config.enabled,
      windowMs: config.windowMs,
      maxPerWindow: config.maxPerWindow,
      maxConcurrent: config.maxConcurrent,
    });
  }
  return singleton;
}
