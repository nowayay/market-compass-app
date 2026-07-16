import "server-only";

/**
 * SERVER-ONLY, REQUEST-SCOPED internal source types.
 *
 * These types model an exact page URL as it may transiently appear WHILE a
 * single research request is being processed (e.g. straight out of a web-search
 * tool result, before it is reduced to an origin). They are deliberately NOT
 * exported through any public contract and MUST NOT be persisted, cached,
 * logged, or embedded in errors or API responses.
 *
 * Invariants (approved architecture decisions):
 * - An exact page URL may exist only in memory, only during the one request that
 *   produced it.
 * - Before anything leaves this boundary (public API, persistence, logs, errors)
 *   it must be reduced to an origin-only `SafeDiscoveredSource`
 *   (see webSourceSecurity.ts). The public `ResearchSource.url` is origin-only.
 *
 * This module intentionally contains types only — the discovery/verification
 * pipeline that produces these values is a later stage and is NOT implemented in
 * this commit.
 */

/**
 * An exact page URL captured transiently during one request. Non-persistable.
 * There is deliberately no public/contract counterpart to this type.
 */
export interface RequestScopedExactUrl {
  /** The full URL as observed. NEVER stored, cached, logged, or returned. */
  readonly exactUrl: string;
}

/**
 * A raw, request-scoped discovered reference that may still carry an exact URL.
 * It must be sanitized to an origin-only source before it can leave the request.
 */
export interface RequestScopedDiscoveredReference extends RequestScopedExactUrl {
  /** ISO timestamp the reference was observed during this request. */
  readonly observedAt: string;
}
