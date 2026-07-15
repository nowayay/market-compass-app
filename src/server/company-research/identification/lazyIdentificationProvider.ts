import type { CompanyIdentificationProvider } from "./types.ts";

/**
 * Wraps an identification provider so its (potentially expensive / config-
 * requiring) construction is deferred until the first real `discoverCandidates`
 * call. Flows that never identify by name (exact KRS, selected candidate,
 * feature-flag-disabled) therefore never trigger `build()` — so, in production,
 * they never read the OpenAI configuration or create the OpenAI client.
 *
 * Pure and dependency-free, so the laziness is directly unit-testable.
 */
export function lazyIdentificationProvider(
  build: () => CompanyIdentificationProvider,
): CompanyIdentificationProvider {
  let inner: CompanyIdentificationProvider | null = null;
  return {
    name: "openai_web_search",
    discoverCandidates(query, signal) {
      if (!inner) inner = build();
      return inner.discoverCandidates(query, signal);
    },
  };
}
