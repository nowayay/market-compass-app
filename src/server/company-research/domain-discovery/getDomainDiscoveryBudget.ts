import "server-only";
import { getDomainDiscoveryConfig } from "./config";
import { createDomainDiscoveryBudget } from "./domainDiscoveryBudget";
import type { DomainDiscoveryBudget } from "./domainDiscoveryBudget";

/**
 * Process-wide singleton domain-discovery budget, built from the dedicated
 * config. Shared across all requests in this process (documented process-local
 * limitation, same as the identification budget).
 */
let singleton: DomainDiscoveryBudget | null = null;

export function getDomainDiscoveryBudget(): DomainDiscoveryBudget {
  if (!singleton) {
    const config = getDomainDiscoveryConfig();
    singleton = createDomainDiscoveryBudget({
      enabled: config.enabled,
      windowMs: config.windowMs,
      maxPerWindow: config.maxPerWindow,
      maxConcurrent: config.maxConcurrent,
    });
  }
  return singleton;
}
