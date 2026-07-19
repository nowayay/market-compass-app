import type { DecoratedCountry } from "../../types";
import FlagIcon from '../FlagIcon';

const GRID_COLS = '26px 1.6fr 0.8fr 2fr';

export default function RankingList({
  countries,
  onSelectCountry,
}: {
  countries: DecoratedCountry[];
  onSelectCountry: (countryCode: string) => void;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Ranking krajów ekspansji</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 8, padding: '0 4px 10px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', borderBottom: '1px solid #F1F3F5' }}>
        <div>#</div><div>Kraj</div><div>Wynik</div><div>Podsumowanie</div>
      </div>
      {countries.map((c) => (
        <div
          key={c.countryCode}
          className="mc-ranking-row"
          onClick={() => onSelectCountry(c.countryCode)}
          style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 8, alignItems: 'center', padding: '11px 4px', borderBottom: '1px solid #F5F6F8', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF' }}>{c.rank}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FlagIcon countryId={c.countryCode} size={18} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.countryName}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: c.tierColor }}>{c.score}</div>
          <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.summary}</div>
        </div>
      ))}
    </div>
  );
}
