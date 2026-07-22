/**
 * A narrow, single-use tracked wrapper around the injected clock (`deps.now`),
 * used ONLY so this orchestrator can OBSERVE — without independently reading —
 * the ONE timestamp Profile Assembly's own clock read produces this
 * invocation, so the cross-stage consistency validator can compare Profile
 * Assembly's raw output against that TRUSTED value instead of deriving an
 * "anchor" from the untrusted output itself (which a malicious
 * `assembleCompanyProfile` could otherwise forge self-consistently).
 *
 * The wrapper never calls the original clock on its own initiative — it only
 * forwards the SAME call Profile Assembly makes internally, and allows
 * EXACTLY ONE such call for the lifetime of one wrapper instance. Profile
 * Assembly itself already reads its clock exactly once per invocation
 * (`getAssemblyTimestamp(deps.now)`), so a genuine, well-behaved assembly run
 * always satisfies this; any other call count (zero, because a hostile
 * dependency fabricated a result without ever consulting the clock; or two or
 * more, because a hostile dependency tried to read a second, different
 * instant) is rejected by the caller after `assembleCompanyProfile` returns.
 */
import { CompanyWebResearchInvariantError } from "./errors.ts";

export interface TrackedAssemblyClock {
  /** Forwarded to Profile Assembly in place of the raw injected clock. */
  now: () => Date;
  /** How many times Profile Assembly actually invoked the clock. */
  callCount: () => number;
  /** The single validated ISO timestamp recorded from the one allowed call, or `null` if none was recorded. */
  recordedTimestamp: () => string | null;
}

/**
 * Creates one single-use tracked clock wrapping `now`. A fresh instance must be
 * created for every `assembleCompanyProfile` call — it is stateful and not
 * reusable across invocations.
 */
export function createTrackedAssemblyClock(now: () => Date): TrackedAssemblyClock {
  let calls = 0;
  let recorded: string | null = null;

  const wrapped = (): Date => {
    calls += 1;
    if (calls > 1) {
      throw new CompanyWebResearchInvariantError("assembly clock invoked more than once");
    }
    const value = now();
    // Record the exact returned instant as a canonical ISO string — this is
    // reading the SAME already-produced value, never a second clock call and
    // never a second, independently-manufactured timestamp. An invalid `Date`
    // is left unrecorded; Profile Assembly's own clock validation
    // (`getAssemblyTimestamp`) already rejects such a value on its own.
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      recorded = value.toISOString();
    }
    return value;
  };

  return {
    now: wrapped,
    callCount: () => calls,
    recordedTimestamp: () => recorded,
  };
}
