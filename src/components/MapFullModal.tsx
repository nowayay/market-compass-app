import type { DecoratedResult, WorldFeature } from "../types";
import { buildMapFeatures, MapLegend } from './dashboard/WorldMap';

export default function MapFullModal({
  mapReady,
  worldFeatures,
  results,
  onClose,
}: {
  mapReady: boolean;
  worldFeatures: WorldFeature[];
  results: DecoratedResult[];
  onClose: () => void;
}) {
  const mapFeatures = buildMapFeatures(worldFeatures, results);
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, animation: 'mc-fade-up .18s ease' }} onClick={onClose}>
      <div onClick={stopProp} style={{ background: '#fff', borderRadius: 18, padding: 24, width: 'min(1100px,94vw)', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>Mapa potencjału rynków</div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', width: 34, height: 34, borderRadius: 9, cursor: 'pointer', fontSize: 15, color: '#6B7280' }}>✕</button>
        </div>
        {mapReady && (
          <div style={{ width: '100%', background: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
            <svg viewBox="0 0 960 470" style={{ width: '100%', display: 'block' }}>
              {mapFeatures.map((mf, i) => (
                <path key={`${mf.iso3}-${i}`} d={mf.d} fill={mf.fill} stroke="#FFFFFF" strokeWidth="0.6" onClick={mf.onClick} className="mc-map-path" style={{ cursor: mf.cursor }} />
              ))}
            </svg>
          </div>
        )}
        <MapLegend />
      </div>
    </div>
  );
}
