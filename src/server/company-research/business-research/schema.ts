import { z } from "zod";
import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import { BusinessResearchPrivacyError, InvalidBusinessResearchResponseError } from "./errors.ts";
import type { BusinessAmbiguityCode, RawBusinessFacts } from "./types.ts";

/** Field/item limits (also re-enforced deterministically after normalization). */
export const INDUSTRY_DESCRIPTION_MAX = 160;
export const PRODUCTS_MAX_ITEMS = 12;
export const PRODUCTS_ITEM_MAX = 120;
export const SEGMENTS_MAX_ITEMS = 8;
export const SEGMENTS_ITEM_MAX = 100;
export const MARKETS_MAX_ITEMS = 12;
export const MARKETS_ITEM_MAX = 80;
export const AMBIGUITY_MAX_ITEMS = 8;

/** The closed set of allowed ambiguity codes. */
export const ALLOWED_AMBIGUITY_CODES: readonly BusinessAmbiguityCode[] = [
  "multiple_legal_entities",
  "group_scope_unclear",
  "subsidiary_scope_unclear",
  "third_party_listing_scope",
  "contradictory_activities",
  "contradictory_offerings",
  "contradictory_customer_segments",
  "contradictory_markets",
  "insufficient_business_evidence",
  "multiple_business_activities",
];

/** JSON Schema name for the OpenAI Structured Output. */
export const BUSINESS_RESEARCH_SCHEMA_NAME = "company_business_research";

/**
 * Strict JSON Schema for the model's Structured Output. It exposes ONLY the four
 * business-fact targets plus a closed `ambiguityCodes` enum — deliberately no
 * field for URLs, citations, source ids, confidence, explanations, narrative,
 * recommendations, SWOT, ranking, sales channels, international experience,
 * revenue, employees, owners/founders/board/representatives/contact persons,
 * person names, emails, phones, PESEL, social profiles, page content or snippets.
 * `additionalProperties` is false and every property is required (null / empty
 * arrays represent unknown information).
 */
export const BUSINESS_RESEARCH_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    industryDescription: { type: ["string", "null"], maxLength: INDUSTRY_DESCRIPTION_MAX },
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
    ambiguityCodes: {
      type: "array",
      maxItems: AMBIGUITY_MAX_ITEMS,
      items: { type: "string", enum: [...ALLOWED_AMBIGUITY_CODES] },
    },
  },
  required: [
    "industryDescription",
    "productsServices",
    "customerSegments",
    "operatingMarkets",
    "ambiguityCodes",
  ],
};

/**
 * STRICT runtime schema that mirrors the provider JSON Schema exactly: all five
 * properties required, additional properties REJECTED, exact scalar/array types,
 * exact enum values, exact count and length bounds. Nothing is optional, filtered,
 * substituted or truncated — a mismatch is an error, not a silent repair.
 */
const strictOutputSchema = z.strictObject({
  industryDescription: z.string().max(INDUSTRY_DESCRIPTION_MAX).nullable(),
  productsServices: z.array(z.string().max(PRODUCTS_ITEM_MAX)).max(PRODUCTS_MAX_ITEMS),
  customerSegments: z.array(z.string().max(SEGMENTS_ITEM_MAX)).max(SEGMENTS_MAX_ITEMS),
  operatingMarkets: z.array(z.string().max(MARKETS_ITEM_MAX)).max(MARKETS_MAX_ITEMS),
  ambiguityCodes: z
    .array(z.enum([...ALLOWED_AMBIGUITY_CODES] as [BusinessAmbiguityCode, ...BusinessAmbiguityCode[]]))
    .max(AMBIGUITY_MAX_ITEMS),
});

/**
 * Parses the raw model output with a privacy-BEFORE-sanitize order:
 *  1. parse JSON into an `unknown` raw value (invalid JSON → invalid-response),
 *  2. run `assertNoPersonalData` over the COMPLETE raw value — personal data
 *     anywhere (including unknown fields / nested objects) → privacy error,
 *  3. STRICTLY validate the complete raw value — any unknown field, missing
 *     field, wrong type, unknown enum value, excessive count/length → invalid.
 *
 * Deterministic business-fact normalization happens LATER (never here). This
 * function never removes, substitutes, filters or truncates provider output.
 */
export function parseBusinessResearchOutput(raw: unknown): RawBusinessFacts {
  // 1. JSON → unknown.
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidBusinessResearchResponseError("Business research output was not valid JSON");
    }
  }

  // 2. Privacy over the COMPLETE raw value, before anything is validated/removed.
  try {
    assertNoPersonalData(value, "businessResearchRawOutput");
  } catch (cause) {
    if (cause instanceof PersonalDataLeakError) {
      throw new BusinessResearchPrivacyError(undefined, cause);
    }
    throw cause;
  }

  // 3. Strict validation (no optional/loose/repair).
  const parsed = strictOutputSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidBusinessResearchResponseError("Business research output failed strict validation");
  }

  return {
    industryDescription: parsed.data.industryDescription,
    productsServices: parsed.data.productsServices,
    customerSegments: parsed.data.customerSegments,
    operatingMarkets: parsed.data.operatingMarkets,
    ambiguityCodes: parsed.data.ambiguityCodes,
  };
}
