import type { DecoratedResult } from "../types";
import FlagIcon from './FlagIcon';

export default function CountryDetailModal({
  result,
  onClose,
}: {
  result: DecoratedResult;
  onClose: () => void;
}) {
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end', animation: 'mc-fade-up .18s ease' }} onClick={onClose}>
      <div onClick={stopProp} style={{ width: 480, maxWidth: '92vw', height: '100%', background: '#FAFBFC', boxShadow: '-16px 0 40px rgba(0,0,0,0.15)', overflowY: 'auto', padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: result.tierColor }}>{result.tierLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
              <FlagIcon countryId={result.country.id} size={28} />
              {result.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', fontSize: 15, color: '#6B7280' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '20px 0' }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #EDEFF2', borderRadius: 12, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A' }}>{result.score}</div>
            <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Ocena ogólna</div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #EDEFF2', borderRadius: 12, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A' }}>{result.fit}</div>
            <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Dopasowanie do profilu</div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #EDEFF2', borderRadius: 12, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>{result.risk}</div>
            <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>Poziom ryzyka</div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #EDEFF2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>Uzasadnienie rekomendacji</div>
          <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.55 }}>{result.justification}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#16803C', textTransform: 'uppercase', marginBottom: 8 }}>Zalety</div>
          {result.pros.map((pr, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#1F2937', lineHeight: 1.5, marginBottom: 6 }}><span style={{ color: '#16A34A' }}>✓</span>{pr}</div>
          ))}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: 8 }}>Wady</div>
          {result.cons.map((cn, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#1F2937', lineHeight: 1.5, marginBottom: 6 }}><span style={{ color: '#F59E0B' }}>–</span>{cn}</div>
          ))}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', marginBottom: 8 }}>Ryzyka</div>
          {result.risks.map((rk, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#1F2937', lineHeight: 1.5, marginBottom: 6 }}><span style={{ color: '#EF4444' }}>!</span>{rk}</div>
          ))}
        </div>

        <div style={{ background: '#16A34A0D', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', marginBottom: 6 }}>Proponowana strategia wejścia</div>
          <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.5 }}>{result.strategy}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid #EDEFF2', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Przewidywana inwestycja</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{result.investmentLevel}</div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{result.investmentRange}</div>
          </div>
          <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid #EDEFF2', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>Kluczowe wskaźniki</div>
            <div style={{ fontSize: 11.5, color: '#1F2937', lineHeight: 1.6 }}>PKB: {result.country.gdp} bln USD<br />Wzrost PKB: {result.country.growth}%<br />Inflacja: {result.country.inflation}%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
