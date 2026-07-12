import type { Company } from "../types";
import CompassLogo from '../components/CompassLogo';

export default function CompanyFormScreen({
  company,
  nameMissing,
  onFieldChange,
  onBackToProfiles,
  onSubmitForm,
}: {
  company: Company;
  nameMissing: boolean;
  onFieldChange: (field: keyof Company, value: string) => void;
  onBackToProfiles: () => void;
  onSubmitForm: () => void;
}) {
  const nameBorder = nameMissing ? '#DC2626' : '#E5E7EB';

  return (
    <div style={{ minHeight: '100vh', padding: '36px 20px 80px', animation: 'mc-fade-up .4s ease' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CompassLogo size={36} />
            <div style={{ fontSize: 18, fontWeight: 800, color: '#13294F' }}>Market<span style={{ color: '#16A34A' }}>Compass</span></div>
          </div>
          <button onClick={onBackToProfiles} style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>← Zmień profil</button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' }}>Znajdź swoją firmę</div>
        <div style={{ marginBottom: 32, fontSize: 14.5, color: '#6B7280' }}>Podaj nazwę firmy — AI wyszuka jej dane i na tej podstawie przygotuje analizę potencjału ekspansji zagranicznej.</div>

        <div style={{ background: '#fff', border: '1px solid #E8E2D8', borderRadius: 16, padding: 26, marginBottom: 20 }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1F2937', marginBottom: 6 }}>Nazwa firmy <span style={{ color: '#16A34A' }}>*</span></label>
            <input
              className="mc-input"
              value={company.name}
              onChange={(e) => onFieldChange('name', e.target.value)}
              placeholder="np. Nordic Furniture Co."
              style={{ width: '100%', padding: '12px 14px', border: `1px solid ${nameBorder}`, borderRadius: 10, fontSize: 15, outline: 'none' }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Opcjonalnie — zawęź wyszukiwanie</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1F2937', marginBottom: 6 }}>Rok założenia</label>
              <input
                className="mc-input"
                value={company.foundedYear}
                onChange={(e) => onFieldChange('foundedYear', e.target.value)}
                placeholder="np. 2016"
                style={{ width: '100%', padding: '10px 13px', border: '1px solid #E8E2D8', borderRadius: 9, fontSize: 14, outline: 'none' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1F2937', marginBottom: 6 }}>Numer KRS</label>
              <input
                className="mc-input"
                value={company.krs}
                onChange={(e) => onFieldChange('krs', e.target.value)}
                placeholder="np. 0000123456"
                style={{ width: '100%', padding: '10px 13px', border: '1px solid #E8E2D8', borderRadius: 9, fontSize: 14, outline: 'none' }}
              />
            </div>
          </div>
          {nameMissing && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: '#DC2626', fontWeight: 600 }}>Podaj nazwę firmy, aby AI mogło rozpocząć wyszukiwanie.</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#16A34A0D', border: '1px solid #16A34A26', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
          <span style={{ fontSize: 16, lineHeight: 1.3 }}>✦</span>
          <div style={{ fontSize: 12.5, color: '#15803D', lineHeight: 1.5 }}>AI automatycznie pobierze publicznie dostępne dane firmy — branżę, profil działalności, skalę i lokalizację — a następnie wygeneruje pełną analizę ekspansji. Wszystkie dane możesz później edytować w profilu.</div>
        </div>

        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
          Dane firmy oraz wyniki wyszukiwania są wykorzystywane wyłącznie do wygenerowania spersonalizowanej analizy AI dotyczącej ekspansji zagranicznej. W celu przeprowadzenia analizy dane te są przesyłane do interfejsu Anthropic API. Dane nie są wykorzystywane do żadnych innych celów bez Twojej zgody.
        </div>

        <button className="mc-submit-btn" onClick={onSubmitForm} style={{ width: '100%', background: '#16A34A', color: '#fff', border: 'none', borderRadius: 12, padding: '16px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(22,163,74,0.25)' }}>Wyszukaj firmę i generuj analizę →</button>
      </div>
    </div>
  );
}
