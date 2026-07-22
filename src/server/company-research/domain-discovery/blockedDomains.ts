/**
 * Small, explicit blocked-domain policy for domain discovery.
 *
 * These are hosts that are clearly NOT a company's own official website: search
 * engines, social platforms, encyclopedias, company directories / KRS
 * aggregators, marketplaces, job boards, review sites, URL shorteners and
 * parked-domain services. The list is deliberately conservative (common
 * categories + domains already seen in identification sources) rather than a
 * massive speculative catalog. Subdomains of any blocked host are also blocked.
 *
 * Pure and dependency-free.
 */

const BLOCKED_DOMAINS: readonly string[] = [
  // Search engines
  "google.com", "bing.com", "duckduckgo.com", "yahoo.com", "yandex.com",
  "baidu.com",
  // Social media / video
  "facebook.com", "instagram.com", "linkedin.com", "x.com", "twitter.com",
  "youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "threads.net",
  // Encyclopedias
  "wikipedia.org", "wikiwand.com", "wikidata.org",
  // Company directories / KRS aggregators
  "rejestr.io", "aleo.com", "panoramafirm.pl", "krs-online.com.pl",
  "bisnode.pl", "emis.com", "dnb.com",
  // Marketplaces
  "allegro.pl", "amazon.com", "ebay.com", "olx.pl", "ceneo.pl", "etsy.com",
  // Job boards
  "pracuj.pl", "indeed.com", "glassdoor.com",
  // Review platforms
  "trustpilot.com", "opineo.pl", "gowork.pl", "yelp.com",
  // URL shorteners
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly",
  // Parked-domain / for-sale services (deterministically identifiable)
  "sedo.com", "parkingcrew.com", "bodis.com", "afternic.com",
];

const BLOCKED_SET: ReadonlySet<string> = new Set(BLOCKED_DOMAINS);

/**
 * True when `hostname` is a blocked domain or a subdomain of one. `hostname`
 * must already be a bare host (no scheme/port), e.g. from `safeOriginFromUrl`.
 */
export function isBlockedDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (BLOCKED_SET.has(host)) return true;
  for (const blocked of BLOCKED_SET) {
    if (host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}
