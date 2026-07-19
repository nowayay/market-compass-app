// Pure logic (no JSX) so it can be unit-tested directly under Node, and reused
// by both the inline dashboard map and the full-screen map modal.
import { iso2ToIso3 } from "../../data/iso2to3.ts";
import type { DecoratedCountry, MapCountryFeature, WorldFeature } from "../../types";

/** Matches each world-atlas outline against the ranked countries, by ISO code. */
export function buildMapFeatures(worldFeatures: WorldFeature[], countries: DecoratedCountry[]): MapCountryFeature[] {
  return (worldFeatures || []).map((f) => {
    const match = countries.find((c) => iso2ToIso3(c.countryCode) === f.iso3);
    return {
      iso3: f.iso3,
      d: f.d,
      fill: match ? match.mapFill : '#D1D5DB',
      cursor: match ? 'pointer' : 'default',
      countryCode: match ? match.countryCode : null,
    };
  });
}
