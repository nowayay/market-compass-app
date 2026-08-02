import type { DecoratedCountry } from "../../types";
import FlagIcon from '../FlagIcon';

/**
 * Highlights the #1 ranked expansion target beneath the ranking. Pure
 * presentation over data the dashboard already has — it triggers NO new API
 * call. "Zobacz szczegóły" opens the same country modal the ranking/map use.
 */
export default function TopExpansionCard({
  country,
  onSelectCountry,
}: {
  country: DecoratedCountry;
  onSelectCountry: (countryCode: string) => void;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 14 }}>Najlepszy kierunek ekspansji</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <FlagIcon countryId={country.countryCode} size={30} />
          <span style={{ fontSize: 19, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{country.countryName}</span>
        </div>
        <div style={{ flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: country.tierInk }}>{country.score}</span>
          <span style={{ fontSize: 12, color: '#6B7280' }}> /100</span>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.55, marginTop: 12 }}>{country.summary}</div>

      <button
        className="mc-top-expansion-cta"
        onClick={() => onSelectCountry(country.countryCode)}
        style={{ width: '100%', border: 'none', background: '#F0FDF4', color: '#15803D', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 16 }}
      >
        Zobacz szczegóły →
      </button>
    </div>
  );
}
