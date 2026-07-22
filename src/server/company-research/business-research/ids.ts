import { createHash } from "node:crypto";

/**
 * Stable, deterministic identifiers for business-research sources, evidence array
 * items, and evidence records.
 *
 * The repository has no shared hashing helper, so this module provides a small
 * SHA-256-based one. IDs depend ONLY on stable inputs (normalized origin, target
 * path, canonical normalized value) — never on array order, retrievedAt, request
 * id, model output ordering, page paths or randomness.
 *
 * The digest is encoded with a LETTERS-ONLY alphabet (a–p), a bijective mapping
 * of the 16 hex characters. This keeps ids collision-resistant while guaranteeing
 * they contain no digits — so a generated id can never resemble a phone/PESEL and
 * passes the personal-data guard WITHOUT any privacy-policy exemption.
 */

const HEX_TO_ALPHA: Record<string, string> = {
  "0": "a", "1": "b", "2": "c", "3": "d", "4": "e", "5": "f", "6": "g", "7": "h",
  "8": "i", "9": "j", a: "k", b: "l", c: "m", d: "n", e: "o", f: "p",
};

/** A short, stable letters-only digest of the input (16 chars, alphabet a–p). */
export function shortHash(input: string): string {
  const hex = createHash("sha256").update(input).digest("hex").slice(0, 16);
  let out = "";
  for (const ch of hex) out += HEX_TO_ALPHA[ch];
  return out;
}

/** Stable source id derived from the normalized origin (NOT from retrievedAt). */
export function businessSourceId(origin: string): string {
  return `src_web_${shortHash(origin)}`;
}

/** Stable array-item id derived from the target path + canonical normalized value. */
export function businessItemId(targetPath: string, canonicalValue: string): string {
  return `itm_${shortHash(`${targetPath}|${canonicalValue}`)}`;
}

/** Stable evidence id derived from the target path + itemId (null for scalars). */
export function businessEvidenceId(targetPath: string, itemId: string | null): string {
  return `fev_${shortHash(`${targetPath}|${itemId ?? ""}`)}`;
}
