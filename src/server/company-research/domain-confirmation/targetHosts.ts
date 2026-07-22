/**
 * Deterministic apex/www host equivalence for domain confirmation.
 *
 * Only a hostname and its exact `www.` counterpart are ever treated as
 * equivalent — e.g. `example.com` ⇔ `www.example.com`. Arbitrary subdomains are
 * NEVER treated as equivalent. This is used both to build the web-search
 * `allowed_domains` filter and to re-check every provider-attested source in
 * backend code (the OpenAI filter also permits subdomains, so the backend check
 * is the real guard).
 *
 * Pure and dependency-free.
 */

/**
 * The set of hostnames considered equivalent to `hostname`: the host itself plus
 * its deterministic `www.` toggle (add `www.` when absent, strip it when present).
 */
export function targetHostSet(hostname: string): Set<string> {
  const host = hostname.trim().toLowerCase();
  const set = new Set<string>();
  if (host.length === 0) return set;
  set.add(host);
  if (host.startsWith("www.")) {
    set.add(host.slice(4));
  } else {
    set.add(`www.${host}`);
  }
  return set;
}

/** Deterministically ordered allowed hosts for the web-search `allowed_domains`. */
export function allowedDomainsFor(hostname: string): string[] {
  return [...targetHostSet(hostname)].sort();
}

/** True only when `hostname` is the target host or its exact `www.` counterpart. */
export function isTargetHost(hostname: string, targetDomain: string): boolean {
  return targetHostSet(targetDomain).has(hostname.trim().toLowerCase());
}
