import {
  BusinessResearchBusyError,
  BusinessResearchDisabledError,
  BusinessResearchRateLimitedError,
} from "./errors.ts";

/**
 * A process-local safeguard for the paid business-research flow. It is NOT a
 * distributed production rate limiter — it protects a closed test deployment from
 * runaway cost (documented limitation, same as the discovery/confirmation
 * budgets: per-process counters that reset on restart).
 *
 * Privacy: it stores only counters and timestamps — never IPs, ids, company
 * names or URLs — and logs nothing.
 */
export interface BusinessResearchBudget {
  acquire(): () => void;
}

export interface BusinessResearchBudgetConfig {
  enabled: boolean;
  windowMs: number;
  maxPerWindow: number;
  maxConcurrent: number;
  now?: () => number;
}

export function createBusinessResearchBudget(
  config: BusinessResearchBudgetConfig,
): BusinessResearchBudget {
  const now = config.now ?? (() => Date.now());
  let startTimestamps: number[] = [];
  let active = 0;

  return {
    acquire(): () => void {
      if (!config.enabled) {
        throw new BusinessResearchDisabledError();
      }

      const t = now();
      startTimestamps = startTimestamps.filter((ts) => t - ts < config.windowMs);
      if (startTimestamps.length >= config.maxPerWindow) {
        throw new BusinessResearchRateLimitedError();
      }
      if (active >= config.maxConcurrent) {
        throw new BusinessResearchBusyError();
      }

      startTimestamps.push(t);
      active += 1;

      let released = false;
      return () => {
        if (!released) {
          released = true;
          active = Math.max(0, active - 1);
        }
      };
    },
  };
}
