/**
 * Defense-in-depth regression guard.
 *
 * The PRIMARY privacy protection is structural: strict types, the KRS allowlist
 * mapper, explicit field mapping and the absence of any person model. This
 * assertion is a secondary safety net that fails loudly if a person-related key
 * ever appears in a domain object — it is NOT the main line of defense and does
 * not rely solely on scanning text.
 *
 * It carries its own inline error type and has no local runtime imports, so it
 * stays loadable by the Node test runner.
 */

export class PersonalDataLeakError extends Error {
  readonly key: string;
  readonly path: string;

  constructor(key: string, path: string) {
    super(`Potential personal-data field detected at "${path}"`);
    this.name = "PersonalDataLeakError";
    this.key = key;
    this.path = path;
  }
}

/** Substrings that, if found in an object KEY, indicate natural-person data. */
const FORBIDDEN_KEY_SUBSTRINGS: readonly string[] = [
  "pesel",
  "nazwisko",
  "imie",
  "imię",
  "dataurodzenia",
  "dateofbirth",
  "birth",
  "person",
  "people",
  "czlonk",
  "członk",
  "zarzad",
  "zarząd",
  "wspolnik",
  "wspólnik",
  "prokurent",
  "pelnomocnik",
  "pełnomocnik",
  "beneficjent",
  "beneficial",
  "wlascic",
  "właścic",
  "owner",
  "shareholder",
  "representative",
  "reprezentacj",
  "organnadzoru",
  "employee",
  "pracownik",
  "boardmember",
  "board",
  "contactperson",
];

/** 11 consecutive digits — the shape of a Polish PESEL. */
const PESEL_PATTERN = /\b\d{11}\b/;

function keyLooksPersonal(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_KEY_SUBSTRINGS.some((s) => normalized.includes(s));
}

/**
 * Recursively asserts that `value` contains no person-related keys and no
 * PESEL-shaped string values. Throws PersonalDataLeakError on the first hit.
 */
export function assertNoPersonalData(value: unknown, path = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoPersonalData(item, `${path}[${i}]`));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (keyLooksPersonal(key)) {
        throw new PersonalDataLeakError(key, `${path}.${key}`);
      }
      assertNoPersonalData(child, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && PESEL_PATTERN.test(value)) {
    throw new PersonalDataLeakError("<pesel-shaped-value>", path);
  }
}
