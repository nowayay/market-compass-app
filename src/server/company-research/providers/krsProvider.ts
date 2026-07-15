import "server-only";
import { getCompanyResearchConfig } from "../config";
import { createKrsTransport } from "./internal/krsTransport";
import type { CompanyDataProvider } from "../types";

/**
 * Production KRS provider singleton.
 *
 * It is pinned to the official KRS origin: it never passes a `baseUrl`, so
 * `createKrsTransport` uses `OFFICIAL_KRS_ORIGIN`. The host cannot be changed by
 * a user or an environment variable. Only the request timeout is configurable.
 *
 * The raw KRS response never leaves the transport — this wrapper only forwards
 * the real `fetch` and the timeout.
 */
export function createKrsProvider(): CompanyDataProvider {
  const { timeoutMs } = getCompanyResearchConfig();
  return createKrsTransport({ fetchImpl: fetch, timeoutMs });
}
