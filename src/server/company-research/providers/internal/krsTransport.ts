import {
  CompanyResearchProviderError,
  CompanyResearchTimeoutError,
} from "../../errors.ts";
import { sanitizeKrsResponse } from "./sanitizeKrsResponse.ts";
import type { CompanyDataProvider, KrsCompany } from "../../types.ts";

/**
 * The one and only KRS origin. It is a hard-coded module constant: there is no
 * configuration hook, environment variable, or transport option to change it,
 * in production or in tests. This removes any host-override and the associated
 * SSRF / open-proxy risk.
 */
const KRS_ORIGIN = "https://api-krs.ms.gov.pl";

/** Exposed read-only for assertions/tests. Cannot be used to change the host. */
export const OFFICIAL_KRS_ORIGIN = KRS_ORIGIN;

export interface KrsTransportDeps {
  /** Injected fetch implementation (real `fetch` in production, mock in tests). */
  fetchImpl: typeof fetch;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}

type FailureKind = "abort" | "timeout" | "provider";

/** Classifies a fetch/body failure from the current signal state. Pure. */
export function classifyKrsFailure(ctx: {
  callerAborted: boolean;
  timedOut: boolean;
}): FailureKind {
  if (ctx.callerAborted) return "abort";
  if (ctx.timedOut) return "timeout";
  return "provider";
}

/**
 * Builds a KRS-backed CompanyDataProvider. Kept free of `server-only` and of any
 * bundler-only import so it is directly unit-testable with an injected fetch.
 * The raw KRS payload is confined to this module and passed straight into the
 * allowlist mapper; it is never logged, cached, returned or embedded in errors.
 */
export function createKrsTransport(deps: KrsTransportDeps): CompanyDataProvider {
  return {
    name: "krs",
    async fetchByKrs(krs: string, signal?: AbortSignal): Promise<KrsCompany | null> {
      // `krs` is exactly 10 digits (normalized upstream), safe as a path segment.
      // Origin is always the hard-coded official host — never configurable.
      const url = `${KRS_ORIGIN}/api/krs/OdpisAktualny/${krs}?rejestr=P&format=json`;

      const timeout = AbortSignal.timeout(deps.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

      let response: Response;
      try {
        response = await deps.fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: combined,
          cache: "no-store",
        });
      } catch (cause) {
        throw failureFor(
          classifyKrsFailure({ callerAborted: Boolean(signal?.aborted), timedOut: timeout.aborted }),
          cause,
          undefined,
        );
      }

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new CompanyResearchProviderError(
          `KRS responded with status ${response.status}`,
          response.status,
        );
      }

      // Raw payload lives only here, only until the allowlist runs.
      let text: string;
      try {
        text = await response.text();
      } catch (cause) {
        const kind = classifyKrsFailure({
          callerAborted: Boolean(signal?.aborted),
          timedOut: timeout.aborted,
        });
        if (kind === "abort") throw cause; // caller cancellation propagates as-is
        if (kind === "timeout") throw new CompanyResearchTimeoutError("KRS body read timed out");
        throw new CompanyResearchProviderError("KRS request failed while reading the response body", response.status);
      }

      // Some KRS numbers resolve to an "ok" status (observed: HTTP 204) with an
      // EMPTY body instead of a 404 — e.g. a historical/deregistered entity that
      // has no current "OdpisAktualny" extract. Treat this the same as "not
      // found" rather than crashing on an empty JSON parse (the actual cause of
      // the previous COMPANY_RESEARCH_PROVIDER_ERROR / HTTP 502 regression).
      if (text.trim().length === 0) {
        return null;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch (cause) {
        // A timeout or caller-abort during the body read must NOT be reported as
        // malformed JSON. Classify by the current signal state.
        const kind = classifyKrsFailure({
          callerAborted: Boolean(signal?.aborted),
          timedOut: timeout.aborted,
        });
        if (kind === "abort") throw cause; // caller cancellation propagates as-is
        if (kind === "timeout") throw new CompanyResearchTimeoutError("KRS body read timed out");
        // Genuine malformed JSON — never expose the body or the parser error.
        throw new CompanyResearchProviderError("KRS returned malformed JSON", response.status);
      }

      const company = sanitizeKrsResponse(raw, krs, new Date().toISOString());
      if (company.legalName.length === 0) {
        throw new CompanyResearchProviderError(
          "KRS extract did not contain a usable company name",
          response.status,
        );
      }
      return company;
    },
  };
}

/** Turns a classified failure into the right typed error (rethrowing aborts). */
function failureFor(kind: FailureKind, cause: unknown, status: number | undefined): unknown {
  if (kind === "abort") return cause; // preserve the original AbortError
  if (kind === "timeout") return new CompanyResearchTimeoutError("KRS request timed out");
  return new CompanyResearchProviderError("KRS request failed", status, cause);
}
