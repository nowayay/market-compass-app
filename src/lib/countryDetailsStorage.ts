/**
 * Browser cache for the on-demand country deep-dive, keyed by the company's KRS
 * plus the country code, so re-opening a country never calls the API again.
 * localStorage ONLY — one entry per (company, country) pair.
 *
 * `storage` is injectable (defaults to `localStorage`) so this module is
 * testable in a plain Node environment with no DOM.
 */
import { countryDetailsSchema } from "../contracts/countryDetails.ts";
import type { CountryDetails } from "../contracts/countryDetails.ts";

const KEY_PREFIX = "marketcompass_country_details_v1";

/**
 * Builds the storage key for a (company, country) pair. Falls back to a stable
 * "unknown" bucket when the company has no KRS, so caching still works. The
 * country code is uppercased so casing never fragments the cache.
 */
export function countryDetailsKey(krs: string | undefined, countryCode: string): string {
  const company = krs && krs.trim().length > 0 ? krs.trim() : "unknown";
  return `${KEY_PREFIX}:${company}:${countryCode.trim().toUpperCase()}`;
}

/** Saves one country's details. Never throws (storage may be unavailable). */
export function saveCountryDetails(
  krs: string | undefined,
  countryCode: string,
  details: CountryDetails,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(countryDetailsKey(krs, countryCode), JSON.stringify(details));
  } catch {
    /* ignore — caching is a convenience, never required for the app to work */
  }
}

/**
 * Restores one country's cached details, validated against the shared contract.
 * Returns null for anything missing, malformed, or tampered — a restored value
 * is NEVER trusted blindly.
 */
export function loadCountryDetails(
  krs: string | undefined,
  countryCode: string,
  storage: Storage = localStorage,
): CountryDetails | null {
  try {
    const raw = storage.getItem(countryDetailsKey(krs, countryCode));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const validated = countryDetailsSchema.safeParse(parsed);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}
