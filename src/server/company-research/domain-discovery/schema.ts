import { z } from "zod";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { InvalidDomainDiscoveryResponseError } from "./errors.ts";
import type { DomainDiscoverySignals } from "./types.ts";

/** Maximum domain candidates accepted from a single discovery. */
export const MAX_DOMAIN_CANDIDATES = 3;

/** JSON Schema name for the OpenAI Structured Output. */
export const DOMAIN_DISCOVERY_SCHEMA_NAME = "company_domain_discovery";

/**
 * Strict JSON Schema for the model's Structured Output. Reports only a URL plus
 * the discovered matching SIGNALS — never a title, snippet, page content,
 * description, confidence, `verified` flag, or any person data. In strict mode
 * every property must be listed in `required` and `additionalProperties` must be
 * false; missing evidence is expressed as a nullable value.
 */
export const DOMAIN_DISCOVERY_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      description: "Discovered official-website candidates (unverified).",
      maxItems: MAX_DOMAIN_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string", description: "A page URL on the candidate domain." },
          matchedLegalName: { type: ["string", "null"] },
          matchedKrs: { type: ["string", "null"] },
          matchedNip: { type: ["string", "null"] },
          matchedRegon: { type: ["string", "null"] },
          matchedCity: { type: ["string", "null"] },
        },
        required: [
          "url",
          "matchedLegalName",
          "matchedKrs",
          "matchedNip",
          "matchedRegon",
          "matchedCity",
        ],
      },
    },
  },
  required: ["candidates"],
};

/** A raw, allowlist-mapped structured candidate (url kept only transiently). */
export interface RawDomainCandidate {
  /** The exact URL as reported — request-scoped, never persisted/logged/returned. */
  url: string;
  signals: DomainDiscoverySignals;
}

/** Permissive runtime schema; privacy is enforced by explicit allowlist mapping. */
const rawCandidateSchema = z.looseObject({
  url: z.string(),
  matchedLegalName: z.union([z.string(), z.null()]).optional(),
  matchedKrs: z.union([z.string(), z.null()]).optional(),
  matchedNip: z.union([z.string(), z.null()]).optional(),
  matchedRegon: z.union([z.string(), z.null()]).optional(),
  matchedCity: z.union([z.string(), z.null()]).optional(),
});

const rawOutputSchema = z.looseObject({
  candidates: z.array(z.unknown()),
});

function nullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validates and sanitizes the raw Structured Output into internal raw candidates:
 * - structurally-invalid output → throws InvalidDomainDiscoveryResponseError,
 * - each candidate is allowlist-mapped (url + matching signals only — no title,
 *   snippet, description, confidence or verified flag),
 * - candidates without a usable url string are dropped,
 * - the list is capped at MAX_DOMAIN_CANDIDATES,
 * - the mapped SIGNALS are asserted to contain no personal data (the raw url is
 *   validated/normalized separately and never retained).
 */
export function parseDomainDiscoveryOutput(raw: unknown): RawDomainCandidate[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidDomainDiscoveryResponseError("Domain discovery output was not valid JSON");
    }
  }

  const outer = rawOutputSchema.safeParse(value);
  if (!outer.success) {
    throw new InvalidDomainDiscoveryResponseError("Domain discovery output missing candidates array");
  }

  const candidates: RawDomainCandidate[] = [];
  for (const rawCandidate of outer.data.candidates) {
    const parsed = rawCandidateSchema.safeParse(rawCandidate);
    if (!parsed.success) continue; // skip malformed candidate

    const url = parsed.data.url.trim();
    if (url.length === 0) continue;

    candidates.push({
      url,
      signals: {
        matchedLegalName: nullableString(parsed.data.matchedLegalName),
        matchedKrs: nullableString(parsed.data.matchedKrs),
        matchedNip: nullableString(parsed.data.matchedNip),
        matchedRegon: nullableString(parsed.data.matchedRegon),
        matchedCity: nullableString(parsed.data.matchedCity),
      },
    });
    if (candidates.length >= MAX_DOMAIN_CANDIDATES) break;
  }

  // Defense-in-depth over the mapped SIGNALS only (never the transient url).
  assertNoPersonalData(candidates.map((c) => c.signals), "domainDiscoverySignals");
  return candidates;
}
