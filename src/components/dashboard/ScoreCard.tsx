export default function ScoreCard({ companyScore }: { companyScore: number }) {
  const scoreTierLabel = companyScore >= 70 ? 'Wysoki potencjał ekspansji' : companyScore >= 45 ? 'Umiarkowany potencjał ekspansji' : 'Ograniczony potencjał ekspansji';
  const scoreTierColor = companyScore >= 70 ? '#16A34A' : companyScore >= 45 ? '#D97706' : '#DC2626';
  const scoreDescription = companyScore >= 70
    ? 'Twoja firma ma dobre warunki do ekspansji na wybrane rynki. Sprawdź rekomendacje AI poniżej.'
    : companyScore >= 45
    ? 'Twoja firma ma umiarkowany potencjał — warto dopracować profil i budżet ekspansji.'
    : 'To wczesny etap gotowości. Uzupełnij dane firmy, aby poprawić dopasowanie rynków.';

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', width: 369, height: 283 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>Wynik dopasowania Twojej firmy</div>
        <span style={{ color: '#C4C9D0', fontSize: 15 }} title="Wynik obliczony przez AI">ⓘ</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <div style={{ width: 128, height: 128, borderRadius: '50%', flexShrink: 0, background: `conic-gradient(#16A34A ${companyScore}%, #EBECEF 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#111827' }}>{companyScore}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>/100</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: scoreTierColor, marginBottom: 8 }}>{scoreTierLabel}</div>
          <div style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.55 }}>{scoreDescription}</div>
        </div>
      </div>
    </div>
  );
}
