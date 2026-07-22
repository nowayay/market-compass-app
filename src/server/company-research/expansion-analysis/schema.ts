import { z } from "zod";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { InvalidExpansionAnalysisResponseError } from "../errors.ts";
import { iso2ToIso3 } from "../../../data/iso2to3.ts";
import type { ExpansionAnalysis, RankedCountry } from "../../../contracts/companyDashboard.ts";

/** Exactly 15 distinct expansion-target countries per analysis. */
export const RANKED_COUNTRIES_COUNT = 15;
/** SWOT bullets per category: EXACTLY 4, keeping the payload small and uniform. */
export const SWOT_ITEMS_COUNT = 4;
/**
 * Hard character cap for every free-text field the model returns (each SWOT
 * bullet and each country summary). Anything longer is truncated — never
 * rejected — so a slightly-too-long field shrinks the payload instead of
 * failing the whole analysis. Bounds response size without any UI change.
 */
export const MAX_TEXT_LENGTH = 180;

/** JSON Schema name for the OpenAI Structured Output. */
export const EXPANSION_ANALYSIS_SCHEMA_NAME = "company_expansion_analysis";

/**
 * Strict JSON Schema for the model's Structured Output. Every property is
 * required and `additionalProperties` is false, per OpenAI Structured Output
 * strict-mode rules. The REAL invariants (exact country count, distinctness,
 * 2-letter codes, score range, sort order, bullet count) are re-validated at
 * runtime by `parseExpansionAnalysisOutput` — the JSON Schema alone is never
 * trusted.
 */
export const EXPANSION_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    swot: {
      type: "object",
      additionalProperties: false,
      properties: {
        strengths: { type: "array", items: { type: "string" }, maxItems: SWOT_ITEMS_COUNT },
        weaknesses: { type: "array", items: { type: "string" }, maxItems: SWOT_ITEMS_COUNT },
        opportunities: { type: "array", items: { type: "string" }, maxItems: SWOT_ITEMS_COUNT },
        threats: { type: "array", items: { type: "string" }, maxItems: SWOT_ITEMS_COUNT },
      },
      required: ["strengths", "weaknesses", "opportunities", "threats"],
    },
    rankedCountries: {
      type: "array",
      description: "Exactly 15 distinct recommended expansion-target countries.",
      maxItems: RANKED_COUNTRIES_COUNT,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          countryCode: { type: "string", description: "ISO 3166-1 alpha-2 code" },
          countryName: { type: "string" },
          score: { type: "number", description: "0-100" },
          summary: { type: "string" },
          opportunities: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
        },
        required: ["countryCode", "countryName", "score", "summary", "opportunities", "risks"],
      },
    },
  },
  required: ["swot", "rankedCountries"],
};

const rawSwotSchema = z.looseObject({
  strengths: z.array(z.unknown()),
  weaknesses: z.array(z.unknown()),
  opportunities: z.array(z.unknown()),
  threats: z.array(z.unknown()),
});

const rawCountrySchema = z.looseObject({
  countryCode: z.string(),
  countryName: z.string(),
  score: z.number(),
  summary: z.string(),
  opportunities: z.array(z.unknown()),
  risks: z.array(z.unknown()),
});

const rawOutputSchema = z.looseObject({
  swot: z.unknown(),
  rankedCountries: z.array(z.unknown()),
});

/** Truncates a string to the hard text cap (never rejects an over-long value). */
function boundText(value: string): string {
  return value.length > MAX_TEXT_LENGTH ? value.slice(0, MAX_TEXT_LENGTH) : value;
}

/**
 * Trims a list of unknown values into non-empty strings (dropping the rest),
 * each capped to `MAX_TEXT_LENGTH` characters.
 */
function toStringList(values: unknown[]): string[] {
  return values
    .filter((v): v is string => typeof v === "string")
    .map((v) => boundText(v.trim()))
    .filter((v) => v.length > 0);
}

/**
 * Validates and bounds one SWOT category's bullet list, or throws. Requires
 * EXACTLY `SWOT_ITEMS_COUNT` non-empty bullets: extras are dropped, but too few
 * is a structural failure (retryable by the provider). Each bullet is capped to
 * `MAX_TEXT_LENGTH`.
 */
function toBoundedBullets(values: unknown[], context: string): string[] {
  const items = toStringList(values);
  if (items.length < SWOT_ITEMS_COUNT) {
    throw new InvalidExpansionAnalysisResponseError(`${context} has fewer than ${SWOT_ITEMS_COUNT} items`);
  }
  return items.slice(0, SWOT_ITEMS_COUNT);
}

/**
 * Validates, sanitizes and re-derives the deterministic invariants of the
 * model's raw Structured Output into the public `ExpansionAnalysis` contract:
 * - structurally-invalid output → throws InvalidExpansionAnalysisResponseError,
 * - every SWOT category is bounded to EXACTLY 4 trimmed, non-empty bullets,
 * - every free-text field (SWOT bullet, country summary) is capped to 180 chars,
 * - country codes are uppercased and validated against the same supported
 *   ISO 3166-1 alpha-2 list the world map uses (`iso2ToIso3`), so every
 *   accepted code is guaranteed to be highlightable on the map,
 * - scores outside the [0, 100] range are rejected outright (never clamped),
 * - EXACTLY 15 countries with distinct codes are required (never invented,
 *   never silently deduped/backfilled — a violation is rejected outright),
 * - the final list is (re-)sorted by score descending, never trusting the
 *   model's own ordering,
 * - the result is asserted to contain no personal data (defense-in-depth).
 */
export function parseExpansionAnalysisOutput(raw: unknown): ExpansionAnalysis {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidExpansionAnalysisResponseError("Expansion analysis output was not valid JSON");
    }
  }

  const outer = rawOutputSchema.safeParse(value);
  if (!outer.success) {
    throw new InvalidExpansionAnalysisResponseError("Expansion analysis output missing required fields");
  }

  const swotParsed = rawSwotSchema.safeParse(outer.data.swot);
  if (!swotParsed.success) {
    throw new InvalidExpansionAnalysisResponseError("Expansion analysis output has a malformed swot section");
  }

  const swot = {
    strengths: toBoundedBullets(swotParsed.data.strengths, "swot.strengths"),
    weaknesses: toBoundedBullets(swotParsed.data.weaknesses, "swot.weaknesses"),
    opportunities: toBoundedBullets(swotParsed.data.opportunities, "swot.opportunities"),
    threats: toBoundedBullets(swotParsed.data.threats, "swot.threats"),
  };

  const seenCodes = new Set<string>();
  const rankedCountries: RankedCountry[] = [];
  for (const rawCountry of outer.data.rankedCountries) {
    const parsed = rawCountrySchema.safeParse(rawCountry);
    if (!parsed.success) {
      throw new InvalidExpansionAnalysisResponseError("Expansion analysis output has a malformed ranked country");
    }
    const countryCode = parsed.data.countryCode.trim().toUpperCase();
    if (iso2ToIso3(countryCode) === null) {
      throw new InvalidExpansionAnalysisResponseError("Expansion analysis output has an unsupported country code");
    }
    if (seenCodes.has(countryCode)) {
      throw new InvalidExpansionAnalysisResponseError("Expansion analysis output has a duplicate country code");
    }
    seenCodes.add(countryCode);

    const countryName = parsed.data.countryName.trim();
    const summary = boundText(parsed.data.summary.trim());
    if (countryName.length === 0 || summary.length === 0) {
      throw new InvalidExpansionAnalysisResponseError("Expansion analysis output has an empty country name or summary");
    }
    if (!Number.isFinite(parsed.data.score) || parsed.data.score < 0 || parsed.data.score > 100) {
      throw new InvalidExpansionAnalysisResponseError("Expansion analysis output has a score outside the 0-100 range");
    }
    const score = parsed.data.score;

    rankedCountries.push({
      countryCode,
      countryName,
      score,
      summary,
      opportunities: toStringList(parsed.data.opportunities),
      risks: toStringList(parsed.data.risks),
    });
  }

  if (rankedCountries.length !== RANKED_COUNTRIES_COUNT) {
    throw new InvalidExpansionAnalysisResponseError(
      `Expansion analysis output does not have exactly ${RANKED_COUNTRIES_COUNT} countries`,
    );
  }

  // Never trust the model's own ordering — enforce the sort invariant here.
  rankedCountries.sort((a, b) => b.score - a.score);

  const result: ExpansionAnalysis = { swot, rankedCountries };
  assertNoPersonalData(result, "expansionAnalysis");
  return result;
}
