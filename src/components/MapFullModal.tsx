"use client";

import type { DecoratedCountry, MapStatus, WorldFeature } from "../types";
import { buildMapFeatures, MapError, MapLegend, MapPaths } from './dashboard/WorldMap';
import { useDialog } from '../lib/useDialog';

export default function MapFullModal({
  mapStatus,
  worldFeatures,
  countries,
  onSelectCountry,
  onRetryMap,
  onClose,
}: {
  mapStatus: MapStatus;
  worldFeatures: WorldFeature[];
  countries: DecoratedCountry[];
  onSelectCountry: (countryCode: string) => void;
  onRetryMap: () => void;
  onClose: () => void;
}) {
  const mapFeatures = buildMapFeatures(worldFeatures, countries);
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();
  const panelRef = useDialog(onClose);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.55)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, animation: 'mc-fade-up .18s ease' }} onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-full-title"
        onClick={stopProp}
        style={{ background: '#fff', borderRadius: 18, padding: 24, width: 'min(1100px,94vw)', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div id="map-full-title" style={{ fontSize: 17, fontWeight: 800, color: '#111827' }}>Mapa potencjału rynków</div>
          <button type="button" onClick={onClose} aria-label="Zamknij mapę" style={{ background: '#F3F4F6', border: 'none', width: 34, height: 34, borderRadius: 9, cursor: 'pointer', fontSize: 15, color: '#6B7280' }}>✕</button>
        </div>
        <div style={{ width: '100%', background: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
          {mapStatus === 'ready' ? (
            <svg viewBox="0 0 960 470" style={{ width: '100%', display: 'block' }} aria-label="Mapa potencjału rynków ekspansji">
              <MapPaths mapFeatures={mapFeatures} onSelectCountry={onSelectCountry} />
            </svg>
          ) : (
            <MapError onRetryMap={onRetryMap} />
          )}
        </div>
        <MapLegend />
      </div>
    </div>
  );
}
