import type { ExpansionSwot } from "../../types";

/*
 * Each quadrant's disc carries a white letter, so these are ink weights, not
 * the bright tier fills — white on the old `#F59E0B` reached only 2.15:1. The
 * violet is the one hue with no tier counterpart; it exists solely to keep the
 * fourth quadrant distinguishable from the other three.
 */
const SWOT_META = [
  { key: 'strengths', letter: 'S', label: 'Mocne strony', color: '#15803D' },
  { key: 'weaknesses', letter: 'W', label: 'Słabe strony', color: '#B45309' },
  { key: 'opportunities', letter: 'O', label: 'Szanse', color: '#7C3AED' },
  { key: 'threats', letter: 'T', label: 'Zagrożenia', color: '#B91C1C' },
] as const;

export default function SwotQuadrants({ swot }: { swot: ExpansionSwot | null }) {
  if (!swot) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 18 }}>Analiza SWOT ekspansji</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        {SWOT_META.map((cat) => (
          <div key={cat.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: cat.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{cat.letter}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{cat.label}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {swot[cat.key].map((bullet, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>
                  <span style={{ color: cat.color }}>•</span>{bullet}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5, marginTop: 18 }}>
        Analiza wygenerowana przez AI na podstawie profilu firmy - nie stanowi porady prawnej ani podatkowej i nie zawiera wyliczonych wskaźników finansowych.
      </div>
    </div>
  );
}
