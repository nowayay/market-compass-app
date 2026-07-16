import { isIP } from "node:net";

/**
 * URL validation and source sanitization for web-search sources.
 *
 * Privacy & safety: a full URL or page title may embed a person's name, email or
 * other personal data (in the path, query string or fragment). Therefore only a
 * safe ORIGIN and HOSTNAME ever leave the provider — never the full path, query,
 * fragment, title or any page content. Pure and dependency-free (Node built-in
 * `node:net` only).
 */

/** The only fields of a web source allowed to leave the provider. */
export interface SafeDiscoveredSource {
  /** Scheme + host only, e.g. `https://example.com`. */
  origin: string;
  /** Hostname only, e.g. `example.com`. */
  hostname: string;
}

/** Strips the surrounding brackets from an IPv6 literal hostname. */
function stripIpv6Brackets(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

/**
 * Parses and validates a URL, returning ONLY its safe origin + hostname, or null
 * if the URL is unusable.
 *
 * Accepts https (and http as a fallback). Rejects: credentials, dangerous
 * schemes, localhost (and its subdomains), and ANY IP-literal host (public or
 * private, IPv4 or IPv6, including alternate/normalized forms) — MarketCompass
 * accepts only DNS-domain sources. Does not fetch anything.
 */
export function safeOriginFromUrl(rawUrl: unknown): SafeDiscoveredSource | null {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) return null;

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username.length > 0 || url.password.length > 0) return null;

  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0) return null;

  // Reject every IP literal (WHATWG may already have normalized alternate IPv4
  // notations like 2130706433 / 0x7f000001 into a dotted host).
  if (isIP(stripIpv6Brackets(hostname)) !== 0) return null;

  // Reject localhost and its subdomains (DNS names, not caught by isIP).
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return null;

  // Rebuild the origin from scheme + host only (drops path/query/fragment).
  return { origin: `${url.protocol}//${hostname}`, hostname };
}
