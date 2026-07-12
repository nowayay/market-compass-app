import type { DecoratedResult, MapFeature, WorldFeature } from "../../types";

const LEGEND = [
  { color: '#16A34A', label: 'Bardzo wysoki' },
  { color: '#7CB342', label: 'Wysoki' },
  { color: '#F59E0B', label: 'Średni' },
  { color: '#EF4444', label: 'Bardzo niski' },
  { color: '#D1D5DB', label: 'Brak danych' },
];

export function buildMapFeatures(worldFeatures: WorldFeature[], results: DecoratedResult[]): MapFeature[] {
  return (worldFeatures || []).map((f) => {
    const match = results.find((r) => r.country.iso3 === f.iso3);
    return { iso3: f.iso3, d: f.d, fill: match ? match.mapFill : '#D1D5DB', cursor: match ? 'pointer' : 'default', onClick: match ? match.onOpen : undefined };
  });
}

export function MapLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 14, fontSize: 11.5, color: '#6B7280' }}>
      {LEGEND.map((l) => (
        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
          {l.label}
        </div>
      ))}
    </div>
  );
}

export default function WorldMap({
  mapReady,
  worldFeatures,
  results,
  mapZoom = 1,
  onOpenMapFull,
}: {
  mapReady: boolean;
  worldFeatures: WorldFeature[];
  results: DecoratedResult[];
  mapZoom?: number;
  onOpenMapFull: (e: React.MouseEvent) => void;
}) {
  const mapFeatures = buildMapFeatures(worldFeatures, results);

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', width: 604, height: 365 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Mapa potencjału rynków</div>
        <a href="#" onClick={onOpenMapFull}>Pełna mapa</a>
      </div>

      <div style={{ position: 'relative', width: '100%', background: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
        {mapReady ? (
          <div style={{ width: '100%', transform: `scale(${mapZoom})`, transformOrigin: 'center center', transition: 'transform .2s ease' }}>
            <svg viewBox="0 0 960 470" style={{ width: '100%', display: 'block' }}>
              {mapFeatures.map((mf, i) => (
                <path key={`${mf.iso3}-${i}`} d={mf.d} fill={mf.fill} stroke="#FFFFFF" strokeWidth="0.6" onClick={mf.onClick} className="mc-map-path" style={{ cursor: mf.cursor }} />
              ))}
            </svg>
          </div>
        ) : (
          <div style={{ aspectRatio: '2/1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>Wczytywanie mapy…</div>
        )}
      </div>

      <MapLegend />
    </div>
  );
}
