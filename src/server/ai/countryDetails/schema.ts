import {
  COUNTRY_DETAILS_BARRIERS,
  COUNTRY_DETAILS_FIRST_STEPS,
  COUNTRY_DETAILS_MAX_TEXT,
  COUNTRY_DETAILS_OPPORTUNITIES,
  COUNTRY_DETAILS_RISKS,
  COUNTRY_DETAILS_SEGMENTS,
  countryDetailsSchema,
} from "../../../contracts/countryDetails.ts";
import type { CountryDetails } from "../../../contracts/countryDetails.ts";
import { InvalidCountryDetailsResponseError } from "./errors.ts";

/** JSON Schema name for the OpenAI Structured Output. */
export const COUNTRY_DETAILS_SCHEMA_NAME = "country_expansion_details";

const stringItems = { type: "array", items: { type: "string" } } as const;

/**
 * Strict JSON Schema for the model's Structured Output. Every property is
 * required and `additionalProperties` is false. The REAL invariants (exact list
 * sizes, text caps) are re-validated at runtime by `parseCountryDetailsOutput`
 * against the shared zod contract — the JSON Schema alone is never trusted.
 */
export const COUNTRY_DETAILS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    scoreRationale: { type: "string" },
    opportunities: { ...stringItems, maxItems: COUNTRY_DETAILS_OPPORTUNITIES },
    risks: { ...stringItems, maxItems: COUNTRY_DETAILS_RISKS },
    customerSegments: { ...stringItems, maxItems: COUNTRY_DETAILS_SEGMENTS },
    competition: { type: "string" },
    entryModel: { type: "string" },
    barriers: { ...stringItems, maxItems: COUNTRY_DETAILS_BARRIERS },
    firstSteps: { ...stringItems, maxItems: COUNTRY_DETAILS_FIRST_STEPS },
    confidenceLevel: { type: "string", enum: ["low", "medium", "high"] },
    confidenceRationale: { type: "string" },
  },
  required: [
    "scoreRationale",
    "opportunities",
    "risks",
    "customerSegments",
    "competition",
    "entryModel",
    "barriers",
    "firstSteps",
    "confidenceLevel",
    "confidenceRationale",
  ],
};

function boundText(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > COUNTRY_DETAILS_MAX_TEXT ? trimmed.slice(0, COUNTRY_DETAILS_MAX_TEXT) : trimmed;
}

/** Trims + caps each string, drops empties, then keeps the first `count` items. */
function boundedList(value: unknown, count: number): string[] {
  const values = Array.isArray(value) ? value : [];
  return values
    .map(boundText)
    .filter((v) => v.length > 0)
    .slice(0, count);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Validates + normalizes the model's raw Structured Output into the public
 * `CountryDetails` contract:
 * - each free-text field is trimmed and capped to `COUNTRY_DETAILS_MAX_TEXT`,
 * - each list is trimmed/capped and truncated to its exact required size
 *   (extras dropped); too few items fail validation (retryable),
 * - the final shape is re-checked against the shared zod contract — a
 *   structurally-invalid output throws InvalidCountryDetailsResponseError.
 */
export function parseCountryDetailsOutput(raw: unknown): CountryDetails {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidCountryDetailsResponseError("Country details output was not valid JSON");
    }
  }

  const record = asRecord(value);
  const normalized = {
    scoreRationale: boundText(record.scoreRationale),
    opportunities: boundedList(record.opportunities, COUNTRY_DETAILS_OPPORTUNITIES),
    risks: boundedList(record.risks, COUNTRY_DETAILS_RISKS),
    customerSegments: boundedList(record.customerSegments, COUNTRY_DETAILS_SEGMENTS),
    competition: boundText(record.competition),
    entryModel: boundText(record.entryModel),
    barriers: boundedList(record.barriers, COUNTRY_DETAILS_BARRIERS),
    firstSteps: boundedList(record.firstSteps, COUNTRY_DETAILS_FIRST_STEPS),
    confidenceLevel: record.confidenceLevel,
    confidenceRationale: boundText(record.confidenceRationale),
  };

  const parsed = countryDetailsSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new InvalidCountryDetailsResponseError("Country details output failed schema validation");
  }
  return parsed.data;
}
