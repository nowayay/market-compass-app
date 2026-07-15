import {
  CompanyIdentificationBusyError,
  CompanyIdentificationDisabledError,
  CompanyIdentificationRateLimitedError,
} from "../errors.ts";

/**
 * A process-local safeguard for the paid name-identification flow. It is NOT a
 * distributed production rate limiter — it protects a closed test deployment
 * from runaway cost.
 *
 * Privacy: it stores only counters and timestamps. It never keys on IP, cookies,
 * emails, user identifiers or company names, and logs nothing.
 */
export interface IdentificationBudget {
  /**
   * Acquires a slot for one identification. Throws a typed error when the
   * feature is disabled, the window budget is exhausted, or too many
   * identifications run concurrently. Returns a release() to free the slot.
   */
  acquire(): () => void;
}

export interface IdentificationBudgetConfig {
  enabled: boolean;
  windowMs: number;
  maxPerWindow: number;
  maxConcurrent: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createIdentificationBudget(config: IdentificationBudgetConfig): IdentificationBudget {
  const now = config.now ?? (() => Date.now());
  let startTimestamps: number[] = [];
  let active = 0;

  return {
    acquire(): () => void {
      if (!config.enabled) {
        throw new CompanyIdentificationDisabledError();
      }

      const t = now();
      // Count only identifications STARTED within the rolling window.
      startTimestamps = startTimestamps.filter((ts) => t - ts < config.windowMs);
      if (startTimestamps.length >= config.maxPerWindow) {
        throw new CompanyIdentificationRateLimitedError();
      }
      if (active >= config.maxConcurrent) {
        throw new CompanyIdentificationBusyError();
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
