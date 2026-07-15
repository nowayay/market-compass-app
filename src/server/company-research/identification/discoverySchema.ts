import { z } from "zod";
import { normalizeKrs } from "../resolution/normalizeQuery.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { InvalidIdentificationResponseError } from "../errors.ts";
import type { DiscoveredCompanyCandidate } from "./types.ts";

/** Maximum unique KRS candidates accepted from a single discovery. */
export const MAX_DISCOVERED_CANDIDATES = 5;

/** JSON Schema name for the OpenAI Structured Output. */
export const IDENTIFICATION_SCHEMA_NAME = "company_identification";

/**
 * Strict JSON Schema for the model's Structured Output. It allows ONLY
 * company-as-entity fields — never sourceUrls, sources, website, title,
 * description, snippet or any person data. Sources are obtained from web-search
 * tool metadata, not from the model text. In strict mode every property must be
 * listed in `required` and `additionalProperties` must be false; optional values
 * are expressed as nullable types.
 */
export const IDENTIFICATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      description: "Discovered Polish company candidates.",
      maxItems: MAX_DISCOVERED_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          legalName: { type: "string" },
          krs: { type: "string", description: "Polish KRS number" },
          city: { type: ["string", "null"] },
          countryCode: { type: "string", enum: ["PL"] },
          foundedYear: { type: ["integer", "null"] },
        },
        required: ["legalName", "krs", "city", "countryCode", "foundedYear"],
      },
    },
  },
  required: ["candidates"],
};

/** Permissive runtime schema; privacy is enforced by explicit allowlist mapping. */
const rawCandidateSchema = z.looseObject({
  legalName: z.string(),
  krs: z.union([z.string(), z.number()]),
  city: z.union([z.string(), z.null()]).optional(),
  foundedYear: z.union([z.number(), z.string(), z.null()]).optional(),
});

const rawOutputSchema = z.looseObject({
  candidates: z.array(z.unknown()),
});

/** Coerces a year-like value into a realistic integer year, or undefined. */
function toYear(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isInteger(n)) return undefined;
  const year = n as number;
  const current = new Date().getFullYear();
  return year >= 1800 && year <= current + 1 ? year : undefined;
}

/**
 * Validates and sanitizes the raw Structured Output into internal discovered
 * candidates:
 * - structurally-invalid output → throws InvalidIdentificationResponseError,
 * - each candidate is allowlist-mapped (company-only fields; no website/sources),
 * - KRS is normalized to 10 digits; candidates with an invalid KRS are dropped,
 * - candidates are deduplicated by KRS and capped at MAX_DISCOVERED_CANDIDATES,
 * - the result is asserted to contain no personal data (defense-in-depth).
 */
export function parseDiscoveryOutput(raw: unknown): DiscoveredCompanyCandidate[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidIdentificationResponseError("Discovery output was not valid JSON");
    }
  }

  const outer = rawOutputSchema.safeParse(value);
  if (!outer.success) {
    throw new InvalidIdentificationResponseError("Discovery output missing candidates array");
  }

  const byKrs = new Map<string, DiscoveredCompanyCandidate>();
  for (const rawCandidate of outer.data.candidates) {
    const parsed = rawCandidateSchema.safeParse(rawCandidate);
    if (!parsed.success) continue; // skip malformed candidate

    const legalName = parsed.data.legalName.trim();
    if (legalName.length === 0) continue;

    const krs = normalizeKrs(String(parsed.data.krs));
    if (krs === null) continue; // reject invalid KRS
    if (byKrs.has(krs)) continue; // dedup by KRS

    const city = typeof parsed.data.city === "string" ? parsed.data.city.trim() : "";
    byKrs.set(krs, {
      legalName,
      krs,
      city: city.length > 0 ? city : undefined,
      countryCode: "PL",
      foundedYear: toYear(parsed.data.foundedYear),
    });
    if (byKrs.size >= MAX_DISCOVERED_CANDIDATES) break;
  }

  const result = [...byKrs.values()];
  // Defense-in-depth: never let a person-shaped field survive mapping.
  assertNoPersonalData(result, "discovered");
  return result;
}
