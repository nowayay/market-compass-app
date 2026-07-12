import type { Swot } from "../../types";
import { buildSwotCats } from '../../lib/derive';

export default function SwotQuadrants({ swot }: { swot: Swot | null }) {
  const swotCats = buildSwotCats(swot);

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 18 }}>Analiza SWOT ekspansji</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24 }}>
        {swotCats.map((cat) => (
          <div key={cat.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: cat.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{cat.letter}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{cat.label}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {cat.bullets.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>
                  <span style={{ color: cat.color }}>•</span>{t}
                </div>
              ))}
            </div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: cat.prioBg, color: cat.prioColor, marginBottom: 12 }}>Priorytet: {cat.priority}</span>
            <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}><span style={{ fontWeight: 700, color: '#374151' }}>Działania:</span> {cat.actions}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
