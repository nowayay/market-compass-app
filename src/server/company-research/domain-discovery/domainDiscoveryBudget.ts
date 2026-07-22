import {
  DomainDiscoveryBusyError,
  DomainDiscoveryDisabledError,
  DomainDiscoveryRateLimitedError,
} from "./errors.ts";

/**
 * A process-local safeguard for the paid domain-discovery flow. It is NOT a
 * distributed production rate limiter — it protects a closed test deployment from
 * runaway cost. (Documented limitation, same as the identification budget: the
 * counters are per-process and reset on restart / are not shared across workers.)
 *
 * Privacy: it stores only counters and timestamps — never IPs, ids, company
 * names or URLs — and logs nothing.
 */
export interface DomainDiscoveryBudget {
  /**
   * Acquires a slot for one discovery. Throws a typed error when the feature is
   * disabled, the window budget is exhausted, or too many discoveries run
   * concurrently. Returns a release() to free the slot.
   */
  acquire(): () => void;
}

export interface DomainDiscoveryBudgetConfig {
  enabled: boolean;
  windowMs: number;
  maxPerWindow: number;
  maxConcurrent: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createDomainDiscoveryBudget(
  config: DomainDiscoveryBudgetConfig,
): DomainDiscoveryBudget {
  const now = config.now ?? (() => Date.now());
  let startTimestamps: number[] = [];
  let active = 0;

  return {
    acquire(): () => void {
      if (!config.enabled) {
        throw new DomainDiscoveryDisabledError();
      }

      const t = now();
      // Count only discoveries STARTED within the rolling window.
      startTimestamps = startTimestamps.filter((ts) => t - ts < config.windowMs);
      if (startTimestamps.length >= config.maxPerWindow) {
        throw new DomainDiscoveryRateLimitedError();
      }
      if (active >= config.maxConcurrent) {
        throw new DomainDiscoveryBusyError();
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
