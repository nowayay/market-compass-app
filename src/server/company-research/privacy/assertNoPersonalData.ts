/**
 * Defense-in-depth privacy regression guard.
 *
 * The PRIMARY privacy protection is structural: strict allowlisted schemas, the
 * KRS allowlist mapper, explicit field mapping and the absence of any person
 * model. This assertion is a secondary, path-aware safety net that fails loudly
 * if natural-person data ever appears — either as a forbidden KEY or as a
 * forbidden string VALUE (contact info, PESEL, personal-profile URL, or a
 * role + person-name phrase).
 *
 * Key matching is deterministic and token-aware (NO broad substring matching),
 * and value matching is path-aware (identifiers/dates/ids and legal-entity names
 * are allowlisted). See personalDataPolicy.ts / personalDataPatterns.ts.
 *
 * The thrown error carries ONLY a stable rule code and a safe structural path —
 * never the offending value (and never the raw key text).
 */
import {
  normalizeKey,
  keyViolationCode,
  safePathKey,
  valueViolationCode,
} from "./personalDataPolicy.ts";
import type { PrivacyRuleCode } from "./personalDataPolicy.ts";

export class PersonalDataLeakError extends Error {
  /** Stable privacy rule code (safe to log). */
  readonly code: PrivacyRuleCode;
  /** Safe structural path (object keys + array indices only — no values). */
  readonly path: string;

  constructor(code: PrivacyRuleCode, path: string) {
    // Message contains only the code and the structural path — never a value.
    super(`Personal-data policy violation [${code}] at "${path}"`);
    this.name = "PersonalDataLeakError";
    this.code = code;
    this.path = path;
  }
}

/**
 * Recursively asserts that `value` contains no natural-person data. Throws
 * PersonalDataLeakError on the first violation.
 *
 * `governingKey` is the nearest enclosing OBJECT key (propagated through arrays)
 * used for path-aware value allowlisting; callers pass only the root `path`.
 */
export function assertNoPersonalData(
  value: unknown,
  path = "root",
  governingKey: string | null = null,
): void {
  if (Array.isArray(value)) {
    // Array items keep the enclosing object key as their governing key.
    value.forEach((item, i) => assertNoPersonalData(item, `${path}[${i}]`, governingKey));
    return;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      // The path is built from sanitized keys only, so a dynamic / personal-
      // looking key can never be copied into an error message or log.
      const childPath = `${path}.${safePathKey(key)}`;
      const keyCode = keyViolationCode(key);
      if (keyCode !== null) throw new PersonalDataLeakError(keyCode, childPath);
      assertNoPersonalData(child, childPath, normalizeKey(key));
    }
    return;
  }

  if (typeof value === "string") {
    const valueCode = valueViolationCode(value, governingKey, path);
    if (valueCode !== null) throw new PersonalDataLeakError(valueCode, path);
  }
}
