import type { CompanyCandidate } from "../types";
import CompassLogo from '../components/CompassLogo';

export default function ConfirmCandidateScreen({
  candidates,
  apiError,
  onSelectCandidate,
  onBack,
}: {
  candidates: CompanyCandidate[];
  apiError: string | null;
  onSelectCandidate: (candidateId: string) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', padding: '36px 20px 80px', animation: 'mc-fade-up .4s ease' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CompassLogo size={36} />
            <div style={{ fontSize: 18, fontWeight: 800, color: '#13294F' }}>Market<span style={{ color: '#16A34A' }}>Compass</span></div>
          </div>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Wróć do wyszukiwania</button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' }}>Znaleziono kilka pasujących firm</div>
        <div style={{ marginBottom: 24, fontSize: 14.5, color: '#6B7280' }}>Wybierz właściwy podmiot, aby kontynuować analizę.</div>

        {apiError && (
          <div role="alert" style={{ marginBottom: 20, padding: '12px 14px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>{apiError}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {candidates.map((c) => (
            <button
              key={c.candidateId}
              onClick={() => onSelectCandidate(c.candidateId)}
              className="mc-ranking-card"
              style={{ textAlign: 'left', background: '#fff', border: '1px solid #E8E2D8', borderRadius: 14, padding: 18, cursor: 'pointer' }}
            >
              <div style={{ fontSize: 15.5, fontWeight: 700, color: '#111827' }}>{c.displayName || c.legalName}</div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: '#6B7280' }}>
                {c.identifiers.krs && <span>KRS: {c.identifiers.krs}</span>}
                {c.city && <span>• {c.city}</span>}
                {c.legalForm && <span>• {c.legalForm}</span>}
                {c.foundedYear && <span>• od {c.foundedYear}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
