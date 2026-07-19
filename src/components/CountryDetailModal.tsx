import type { DecoratedCountry } from "../types";
import FlagIcon from './FlagIcon';

export default function CountryDetailModal({
  country,
  onClose,
}: {
  country: DecoratedCountry;
  onClose: () => void;
}) {
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end', animation: 'mc-fade-up .18s ease' }} onClick={onClose}>
      <div onClick={stopProp} style={{ width: 480, maxWidth: '92vw', height: '100%', background: '#FAFBFC', boxShadow: '-16px 0 40px rgba(0,0,0,0.15)', overflowY: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: country.tierColor }}>{country.tierLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
              <FlagIcon countryId={country.countryCode} size={28} />
              {country.countryName}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', fontSize: 15, color: '#6B7280' }}>✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '20px 0' }}>
          <div style={{ width: 84, height: 84, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(${country.tierColor} ${country.score}%, #EBECEF 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{country.score}</div>
              <div style={{ fontSize: 9.5, color: '#9CA3AF' }}>/100</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.55 }}>{country.summary}</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16803C', textTransform: 'uppercase', marginBottom: 8 }}>Szanse</div>
          {country.opportunities.map((op, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#1F2937', lineHeight: 1.5, marginBottom: 6 }}><span style={{ color: '#16A34A' }}>✓</span>{op}</div>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: 8 }}>Ryzyka</div>
          {country.risks.map((rk, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#1F2937', lineHeight: 1.5, marginBottom: 6 }}><span style={{ color: '#EF4444' }}>!</span>{rk}</div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.5, marginTop: 16 }}>
          Analiza wygenerowana przez AI na podstawie profilu firmy. Nie stanowi porady prawnej ani podatkowej, nie zawiera wyliczonych wskaźników finansowych — traktuj ją jako punkt wyjścia do dalszej weryfikacji.
        </div>
      </div>
    </div>
  );
}
