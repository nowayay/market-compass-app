import type { DecoratedResult } from "../../types";
import FlagIcon from '../FlagIcon';

const GRID_COLS = '26px 1.4fr 0.7fr 0.9fr 1.1fr 1fr';

export default function RankingList({
  results,
  showAllRanking,
  onToggleAllRanking,
}: {
  results: DecoratedResult[];
  showAllRanking: boolean;
  onToggleAllRanking: (e: React.MouseEvent) => void;
  onOpenCountry: (id: string) => void;
}) {
  const rankingRows = results.slice(0, showAllRanking ? 30 : 5).map((r, i) => ({ ...r, rank: i + 1 }));
  const rankingToggleLabel = showAllRanking ? 'Pokaż mniej' : 'Zobacz pełny ranking';

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>Ranking krajów</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 8, padding: '0 4px 10px', fontSize: 11, fontWeight: 700, color: '#9CA3AF', borderBottom: '1px solid #F1F3F5' }}>
        <div>#</div><div>Kraj</div><div>Wynik</div><div>Ryzyko</div><div>Potencjał rynku</div>
      </div>
      {rankingRows.map((r) => (
        <div
          key={r.id}
          className="mc-ranking-row"
          onClick={r.onOpen}
          style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: 8, alignItems: 'center', padding: '11px 4px', borderBottom: '1px solid #F5F6F8', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF' }}>{r.rank}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FlagIcon countryId={r.country.id} size={18} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{r.score}</div>
          <div><span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: r.riskBg, color: r.riskColor }}>{r.riskShort}</span></div>
          <div style={{ letterSpacing: 1, fontSize: 12 }}>
            {r.stars.map((st, i) => <span key={i} style={{ color: st.col }}>{st.ch}</span>)}
          </div>
          <div style={{ letterSpacing: 1, fontSize: 11 }} />
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        <a href="#" onClick={onToggleAllRanking} style={{ fontSize: 13, fontWeight: 600 }}>{rankingToggleLabel}</a>
      </div>
    </div>
  );
}
