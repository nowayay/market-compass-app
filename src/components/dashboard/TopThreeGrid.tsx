import type { DecoratedResult } from "../../types";
import FlagIcon from '../FlagIcon';

export default function TopThreeGrid({ results }: { results: DecoratedResult[] }) {
  const topThree = results.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Top 3 rekomendowane rynki</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 26 }}>
        {topThree.map((r) => (
          <div
            key={r.id}
            className="mc-top3-card"
            onClick={r.onOpen}
            style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: 20, cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', transition: 'box-shadow .15s, transform .15s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: r.tierColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{r.rank}</div>
              <FlagIcon countryId={r.country.id} size={26} />
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#111827' }}>{r.name}</div>
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, color: r.tierColor, margin: '14px 0 8px' }}>{r.score}/100</div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: r.tierBg, color: r.tierColor }}>{r.tierLabel}</span>
          </div>
        ))}
      </div>
    </>
  );
}
