import { buildMapFeatures } from "./mapFeatures";
import type { DecoratedCountry, MapCountryFeature, MapStatus, WorldFeature } from "../../types";

export { buildMapFeatures } from "./mapFeatures";

/*
 * These are the map's `fill` values verbatim, and they have to be: a legend
 * swatch is a sample of the map, so it is the one place a color may not be
 * substituted for a more legible one. The three ranked fills each clear 3:1
 * against the white card; the unranked gray does not, and cannot without
 * misrepresenting how the map actually draws unranked countries. Its label
 * carries the meaning instead.
 */
const LEGEND = [
  { color: '#16A34A', label: 'Miejsca 1–5' },
  { color: '#D97706', label: 'Miejsca 6–10' },
  { color: '#EF4444', label: 'Miejsca 11–15' },
  { color: '#D1D5DB', label: 'Brak danych' },
];

export function MapLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, fontSize: 11.5, color: '#6B7280' }}>
      {LEGEND.map((l) => (
        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.color, display: 'inline-block' }} aria-hidden="true" />
          {l.label}
        </div>
      ))}
    </div>
  );
}

/**
 * The map's country outlines, shared by the dashboard card and the full-screen
 * modal. Ranked countries are exposed as buttons so they can be tabbed to and
 * activated with Enter or Space; unranked outlines carry no ranking data, so
 * they stay out of the tab order and out of the accessibility tree entirely.
 */
export function MapPaths({
  mapFeatures,
  onSelectCountry,
}: {
  mapFeatures: MapCountryFeature[];
  onSelectCountry: (countryCode: string) => void;
}) {
  return (
    <>
      {mapFeatures.map((mf, i) => {
        const code = mf.countryCode;
        if (!code) {
          return (
            <path
              key={`${mf.iso3}-${i}`}
              d={mf.d}
              fill={mf.fill}
              stroke="#FFFFFF"
              strokeWidth="0.6"
              aria-hidden="true"
              style={{ cursor: mf.cursor }}
            />
          );
        }
        return (
          <path
            key={`${mf.iso3}-${i}`}
            d={mf.d}
            fill={mf.fill}
            stroke="#FFFFFF"
            strokeWidth="0.6"
            className="mc-map-path"
            role="button"
            tabIndex={0}
            aria-label={`${mf.countryName ?? code} - zobacz szczegóły rynku`}
            onClick={() => onSelectCountry(code)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCountry(code);
              }
            }}
            style={{ cursor: mf.cursor }}
          >
            <title>{mf.countryName ?? code}</title>
          </path>
        );
      })}
    </>
  );
}

/**
 * Shown when the world outlines could not be fetched. The atlas comes from a
 * third-party CDN, so a failure is an ordinary network outcome: name what
 * broke, say what still works, and offer the retry — rather than leaving a
 * "loading" message running forever.
 */
export function MapError({ onRetryMap }: { onRetryMap: () => void }) {
  return (
    <div role="alert" style={{ aspectRatio: '2/1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, textAlign: 'center' }}>
      <div style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.5, maxWidth: 340 }}>
        Nie udało się wczytać mapy świata. Ranking krajów jest kompletny i nie zależy od mapy.
      </div>
      <button
        type="button"
        onClick={onRetryMap}
        style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
      >
        Spróbuj ponownie
      </button>
    </div>
  );
}

export default function WorldMap({
  mapStatus,
  worldFeatures,
  countries,
  onSelectCountry,
  onOpenMapFull,
  onRetryMap,
}: {
  mapStatus: MapStatus;
  worldFeatures: WorldFeature[];
  countries: DecoratedCountry[];
  onSelectCountry: (countryCode: string) => void;
  onOpenMapFull: () => void;
  onRetryMap: () => void;
}) {
  const mapFeatures = buildMapFeatures(worldFeatures, countries);

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Mapa potencjału rynków</div>
        {/*
          Was an <a href="#">: an anchor that never navigated, and that jumped
          the page to the top whenever the handler did not run. It opens a
          dialog, so it is a button — and it is disabled until there is a map
          worth enlarging.
        */}
        <button
          type="button"
          onClick={onOpenMapFull}
          disabled={mapStatus !== 'ready'}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: mapStatus === 'ready' ? '#2563EB' : '#9CA3AF', cursor: mapStatus === 'ready' ? 'pointer' : 'default' }}
        >
          Pełna mapa
        </button>
      </div>

      <div style={{ position: 'relative', width: '100%', background: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
        {mapStatus === 'ready' && (
          <svg viewBox="0 0 960 470" style={{ width: '100%', display: 'block' }} aria-label="Mapa potencjału rynków ekspansji">
            <MapPaths mapFeatures={mapFeatures} onSelectCountry={onSelectCountry} />
          </svg>
        )}
        {mapStatus === 'loading' && (
          <div role="status" style={{ aspectRatio: '2/1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', fontSize: 13 }}>Wczytywanie mapy…</div>
        )}
        {mapStatus === 'error' && <MapError onRetryMap={onRetryMap} />}
      </div>

      <MapLegend />
    </div>
  );
}
