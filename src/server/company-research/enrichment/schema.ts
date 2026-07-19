import { z } from "zod";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";
import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import { CompanyEnrichmentPrivacyError, InvalidCompanyEnrichmentResponseError } from "./errors.ts";
import type { CompanyEnrichmentFacts } from "./types.ts";

/** Field/item limits (also re-enforced deterministically after trimming). */
export const DESCRIPTION_MAX = 500;
export const INDUSTRY_MAX = 120;
export const PRODUCTS_MAX_ITEMS = 8;
export const PRODUCTS_ITEM_MAX = 120;
export const SEGMENTS_MAX_ITEMS = 6;
export const SEGMENTS_ITEM_MAX = 100;
export const MARKETS_MAX_ITEMS = 8;
export const MARKETS_ITEM_MAX = 80;
export const WEBSITE_MAX = 2048;

/** JSON Schema name for the OpenAI Structured Output. */
export const COMPANY_ENRICHMENT_SCHEMA_NAME = "company_profile_enrichment";

/**
 * Strict JSON Schema for the model's Structured Output. It exposes ONLY the
 * seven enrichment targets — deliberately no field for citations, source ids,
 * confidence, explanations, revenue/financial figures, employee counts, or any
 * natural-person data (owners, founders, board, representatives, contacts).
 * `additionalProperties` is false and every property is required (empty
 * string / null / empty array represents unknown information).
 */
export const COMPANY_ENRICHMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string", maxLength: DESCRIPTION_MAX },
    industry: { type: "string", maxLength: INDUSTRY_MAX },
    foundedYear: { type: ["integer", "null"] },
    website: { type: ["string", "null"], maxLength: WEBSITE_MAX },
    productsServices: {
      type: "array",
      maxItems: PRODUCTS_MAX_ITEMS,
      items: { type: "string", maxLength: PRODUCTS_ITEM_MAX },
    },
    customerSegments: {
      type: "array",
      maxItems: SEGMENTS_MAX_ITEMS,
      items: { type: "string", maxLength: SEGMENTS_ITEM_MAX },
    },
    operatingMarkets: {
      type: "array",
      maxItems: MARKETS_MAX_ITEMS,
      items: { type: "string", maxLength: MARKETS_ITEM_MAX },
    },
  },
  required: [
    "description",
    "industry",
    "foundedYear",
    "website",
    "productsServices",
    "customerSegments",
    "operatingMarkets",
  ],
};

const currentYear = new Date().getUTCFullYear();

/**
 * STRICT runtime schema that mirrors the provider JSON Schema exactly: all
 * seven properties required, additional properties REJECTED, exact scalar/
 * array types, exact length bounds, and a plausible founded-year range.
 * Nothing is optional, filtered, substituted or truncated — a mismatch here is
 * an error, not a silent repair.
 *
 * `website` is deliberately typed as ANY string (or null) at this layer, not
 * required to already be origin-only: a model very commonly writes a website
 * with a trailing slash, a `/pl` locale path, or no scheme at all. Rejecting
 * the WHOLE object for that single cosmetic difference would silently discard
 * an otherwise perfectly valid description/industry/products result — the
 * exact MVP-breaking bug this fallback must avoid. The website is normalized
 * to a safe origin (or dropped to `null`) separately, AFTER this parse, using
 * the same hardened `safeOriginFromUrl` helper the rest of the pipeline uses
 * (see below) — never with a bespoke, stricter equality check.
 */
const strictOutputSchema = z.strictObject({
  description: z.string().max(DESCRIPTION_MAX),
  industry: z.string().max(INDUSTRY_MAX),
  foundedYear: z.number().int().min(1700).max(currentYear).nullable(),
  website: z.string().max(WEBSITE_MAX).nullable(),
  productsServices: z.array(z.string().max(PRODUCTS_ITEM_MAX)).max(PRODUCTS_MAX_ITEMS),
  customerSegments: z.array(z.string().max(SEGMENTS_ITEM_MAX)).max(SEGMENTS_MAX_ITEMS),
  operatingMarkets: z.array(z.string().max(MARKETS_ITEM_MAX)).max(MARKETS_MAX_ITEMS),
});

/**
 * Normalizes a possibly-messy model-provided website to a safe origin-only
 * string, or `null` when it cannot be safely normalized (unparseable, wrong
 * scheme, credentials, localhost, IP-literal, etc.) — reusing the SAME
 * hardened helper `identification/webSourceSecurity.ts` uses for web-search
 * source origins. This NEVER throws and never discards the rest of the
 * enrichment result — an unusable website simply becomes `null`.
 */
function normalizeEnrichmentWebsite(website: string | null): string | null {
  if (website === null) return null;
  return safeOriginFromUrl(website)?.origin ?? null;
}

/**
 * Parses the raw model output with a privacy-BEFORE-sanitize order:
 *  1. parse JSON into an `unknown` raw value (invalid JSON → invalid-response),
 *  2. run `assertNoPersonalData` over the COMPLETE raw value — personal data
 *     anywhere (including unknown fields / nested objects) → privacy error,
 *  3. STRICTLY validate the complete raw value — any unknown field, missing
 *     field, wrong type, or excessive count/length → invalid.
 *
 * This function never removes, substitutes, filters or truncates provider
 * output beyond trimming (never invented/repaired).
 */
export function parseCompanyEnrichmentOutput(raw: unknown): CompanyEnrichmentFacts {
  // 1. JSON → unknown.
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidCompanyEnrichmentResponseError("Company enrichment output was not valid JSON");
    }
  }

  // 2. Privacy over the COMPLETE raw value, before anything is validated/removed.
  try {
    assertNoPersonalData(value, "companyEnrichmentRawOutput");
  } catch (cause) {
    if (cause instanceof PersonalDataLeakError) {
      throw new CompanyEnrichmentPrivacyError(undefined, cause);
    }
    throw cause;
  }

  // 3. Strict validation (no optional/loose/repair).
  const parsed = strictOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidCompanyEnrichmentResponseError("Company enrichment output failed strict validation");
  }

  return {
    description: parsed.data.description.trim(),
    industry: parsed.data.industry.trim(),
    foundedYear: parsed.data.foundedYear,
    website: normalizeEnrichmentWebsite(parsed.data.website),
    productsServices: parsed.data.productsServices.map((v) => v.trim()).filter((v) => v.length > 0),
    customerSegments: parsed.data.customerSegments.map((v) => v.trim()).filter((v) => v.length > 0),
    operatingMarkets: parsed.data.operatingMarkets.map((v) => v.trim()).filter((v) => v.length > 0),
  };
}
