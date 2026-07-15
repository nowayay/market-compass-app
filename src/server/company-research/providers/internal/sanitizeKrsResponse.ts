import type { KrsCompany } from "../../types";

/**
 * ALLOWLIST mapper for KRS extracts — a private implementation detail of the KRS
 * provider (hence its location under `providers/internal`). No public domain API
 * accepts a raw KRS payload; only this module does, and it accepts `unknown`
 * (so no raw payload type is exported).
 *
 * Given the raw (untrusted) KRS API response, this builds a brand new object
 * containing ONLY the explicitly allowed company-as-entity fields. It never
 * reads the person-bearing sections of the extract (`dzial2`: reprezentacja /
 * organNadzoru / prokurenci) and never copies the full street address (only
 * city / region / country). Nothing is mutated or deleted on the input — we
 * build up from nothing, which is the whole point of an allowlist.
 *
 * Field paths are based on the official KRS OpenAPI OdpisAktualny JSON shape.
 */

/** Safely read a nested value by path without throwing on missing links. */
function getPath(root: unknown, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Compose a PKD code like `62.01.Z` from its parts, skipping missing pieces. */
function composePkd(entry: unknown): { code?: string; label?: string } {
  if (typeof entry !== "object" || entry === null) return {};
  const e = entry as Record<string, unknown>;
  const parts = [asString(e.kodDzial), asString(e.kodKlasa), asString(e.kodPodklasa)].filter(
    (p): p is string => p !== undefined,
  );
  return {
    code: parts.length > 0 ? parts.join(".") : undefined,
    label: asString(e.opis),
  };
}

/** Map the KRS "kraj" (country) field to an ISO-3166 alpha-2 code. */
function countryCodeFromKraj(kraj: string | undefined): string {
  if (kraj && /polska/i.test(kraj)) return "PL";
  // KRS (register of entrepreneurs) is a Polish registry; default to PL.
  return "PL";
}

export function sanitizeKrsResponse(
  raw: unknown,
  krs: string,
  retrievedAt: string,
): KrsCompany {
  const odpis = getPath(raw, ["odpis"]);

  const naglowek = getPath(odpis, ["naglowekA"]);
  const danePodmiotu = getPath(odpis, ["dane", "dzial1", "danePodmiotu"]);
  const siedziba = getPath(odpis, ["dane", "dzial1", "siedzibaIAdres", "siedziba"]);
  const przedmiot = getPath(odpis, ["dane", "dzial1", "przedmiotDzialalnosci"]);

  const legalName = asString(getPath(danePodmiotu, ["nazwa"])) ?? "";

  const primary = composePkd(getPath(przedmiot, ["przedmiotPrzewazajacejDzialalnosci", "0"]));
  const secondaryEntries = asArray(getPath(przedmiot, ["przedmiotPozostalejDzialalnosci"])).map(
    composePkd,
  );

  const labels = [primary.label, ...secondaryEntries.map((s) => s.label)].filter(
    (l): l is string => l !== undefined,
  );
  const secondaryCodes = secondaryEntries
    .map((s) => s.code)
    .filter((c): c is string => c !== undefined);

  return {
    krs,
    legalName,
    legalForm: asString(getPath(danePodmiotu, ["formaPrawna"])),
    nip: asString(getPath(danePodmiotu, ["identyfikatory", "nip"])),
    regon: asString(getPath(danePodmiotu, ["identyfikatory", "regon"])),
    registrationDate: asString(getPath(naglowek, ["dataRejestracjiWKRS"])),
    // Location is deliberately coarse — city / region / country only.
    city: asString(getPath(siedziba, ["miejscowosc"])),
    region: asString(getPath(siedziba, ["wojewodztwo"])),
    countryCode: countryCodeFromKraj(asString(getPath(siedziba, ["kraj"]))),
    pkdPrimaryCode: primary.code,
    pkdSecondaryCodes: secondaryCodes,
    pkdLabels: labels,
    registerType: asString(getPath(naglowek, ["rejestr"])),
    retrievedAt,
  };
}
