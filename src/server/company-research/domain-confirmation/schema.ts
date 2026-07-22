import { z } from "zod";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import {
  normalizeNipValue,
  normalizeRegonValue,
} from "../domain-evaluation/normalizeDomainSignals.ts";
import { InvalidDomainConfirmationResponseError } from "./errors.ts";
import type { NormalizedFoundIdentifiers } from "./types.ts";

/** Maximum values accepted per identifier array from a single confirmation. */
export const MAX_IDENTIFIER_VALUES = 3;

/** JSON Schema name for the OpenAI Structured Output. */
export const DOMAIN_CONFIRMATION_SCHEMA_NAME = "company_domain_confirmation";

/**
 * Strict JSON Schema for the model's Structured Output. It exposes ONLY three
 * arrays of registry-identifier strings — deliberately no `evidenceUrl` (a
 * model-returned URL is NEVER evidence), no free text, description, title,
 * snippet, page content, confidence, verified/confirmed flag or person field. In
 * strict mode every property must be listed in `required` and
 * `additionalProperties` must be false.
 */
export const DOMAIN_CONFIRMATION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    // No `description`/title annotations: the model is instructed via the
    // request instructions only, and the schema stays free of any free text.
    foundKrsValues: { type: "array", maxItems: MAX_IDENTIFIER_VALUES, items: { type: "string" } },
    foundNipValues: { type: "array", maxItems: MAX_IDENTIFIER_VALUES, items: { type: "string" } },
    foundRegonValues: { type: "array", maxItems: MAX_IDENTIFIER_VALUES, items: { type: "string" } },
  },
  required: ["foundKrsValues", "foundNipValues", "foundRegonValues"],
};

/** Raw, allowlist-mapped identifier strings (kept only transiently, pre-normalize). */
export interface RawFoundIdentifiers {
  krs: string[];
  nip: string[];
  regon: string[];
}

/** Permissive runtime schema; privacy/shape is enforced by explicit mapping below. */
const rawOutputSchema = z.looseObject({
  foundKrsValues: z.array(z.unknown()).optional(),
  foundNipValues: z.array(z.unknown()).optional(),
  foundRegonValues: z.array(z.unknown()).optional(),
});

/** Keeps only non-empty trimmed strings, capped at MAX_IDENTIFIER_VALUES. */
function stringValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
    if (out.length >= MAX_IDENTIFIER_VALUES) break;
  }
  return out;
}

/**
 * Validates and allowlist-maps the raw Structured Output into raw identifier
 * strings:
 * - structurally-invalid output → throws InvalidDomainConfirmationResponseError,
 * - only string values are kept (trimmed, non-empty), capped per array,
 * - the mapped identifier strings are asserted to contain no personal data (they
 *   sit under numeric-safe keys, so this is a pure defense-in-depth pass).
 */
export function parseConfirmationOutput(raw: unknown): RawFoundIdentifiers {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new InvalidDomainConfirmationResponseError(
        "Domain confirmation output was not valid JSON",
      );
    }
  }

  const outer = rawOutputSchema.safeParse(value);
  if (!outer.success) {
    throw new InvalidDomainConfirmationResponseError(
      "Domain confirmation output was not an object",
    );
  }

  const mapped: RawFoundIdentifiers = {
    krs: stringValues(outer.data.foundKrsValues),
    nip: stringValues(outer.data.foundNipValues),
    regon: stringValues(outer.data.foundRegonValues),
  };

  // Defense-in-depth over the mapped identifier strings (never the raw output).
  assertNoPersonalData(mapped, "domainConfirmationFound");
  return mapped;
}

/**
 * Strict EVIDENCE-oriented KRS normalization for values INDEPENDENTLY FOUND on a
 * page (deliberately NOT the input-oriented `normalizeKrsValue`).
 *
 * The trusted input normalizer left-pads short values to 10 digits — safe for a
 * value the backend already vouches for, but dangerous for untrusted page
 * evidence: a stray "1" would pad to "0000000001" and could accidentally match an
 * expected KRS. For found evidence we therefore require an EXACT 10-digit KRS and
 * NEVER pad:
 *  - only digits, spaces and hyphens are allowed (no letters, labels, colons,
 *    slashes or other punctuation),
 *  - after stripping spaces/hyphens there must be EXACTLY 10 digits,
 *  - anything else → null (malformed), which can never verify or confirm.
 *
 * Accepted: "0000123456", "0000-123-456", "0000 123 456".
 * Rejected: "1", "123456", "123456789", "KRS: 0000123456", "0000/123/456",
 *           "ABC0000123456".
 */
export function normalizeFoundKrsValue(raw: string): string | null {
  const match = /^\s*([0-9\s-]+)\s*$/.exec(raw);
  if (match === null) return null; // arbitrary letters / punctuation present
  const digits = match[1].replace(/[\s-]/g, "");
  return digits.length === 10 ? digits : null; // exact length, never padded
}

/** Deduplicates preserving first-seen order. */
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Strict deterministic normalization of raw found identifiers.
 *
 * KRS uses the EVIDENCE-oriented `normalizeFoundKrsValue` (exact 10 digits, NEVER
 * padded) — NOT the input-oriented padding normalizer — so a short stray number
 * on a page cannot pad into a matching KRS. NIP requires exactly 10 digits
 * (optional case-insensitive `PL` prefix) and REGON exactly 9 or 14 digits;
 * neither pads, so both are already safe against the short-value problem.
 *
 * A NON-empty raw value that fails normalization sets the matching `malformed*`
 * flag — a malformed value is neither a verification nor a conflict; it only
 * downgrades the outcome to `unverified`. Valid values are normalized and
 * de-duplicated.
 */
export function normalizeFoundIdentifiers(raw: RawFoundIdentifiers): NormalizedFoundIdentifiers {
  const normalizeList = (
    values: string[],
    normalize: (v: string) => string | null,
  ): { valid: string[]; malformed: boolean } => {
    const valid: string[] = [];
    let malformed = false;
    for (const value of values) {
      const normalized = normalize(value);
      if (normalized === null) {
        malformed = true;
        continue;
      }
      valid.push(normalized);
    }
    return { valid: unique(valid), malformed };
  };

  const krs = normalizeList(raw.krs, normalizeFoundKrsValue);
  const nip = normalizeList(raw.nip, normalizeNipValue);
  const regon = normalizeList(raw.regon, normalizeRegonValue);

  return {
    krs: krs.valid,
    nip: nip.valid,
    regon: regon.valid,
    malformedKrs: krs.malformed,
    malformedNip: nip.malformed,
    malformedRegon: regon.malformed,
  };
}
