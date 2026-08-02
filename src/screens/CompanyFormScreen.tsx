import type { FormValues } from "../types";
import CompassLogo from '../components/CompassLogo';

export default function CompanyFormScreen({
  form,
  formError,
  apiError,
  onFieldChange,
  onSubmitForm,
}: {
  form: FormValues;
  formError: string | null;
  apiError: string | null;
  onFieldChange: (field: keyof FormValues, value: string) => void;
  onSubmitForm: () => void;
}) {
  const nameBorder = formError ? '#DC2626' : '#E5E7EB';

  return (
    <div style={{ minHeight: '100vh', padding: '36px 20px 80px', animation: 'mc-fade-up .4s ease' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <CompassLogo size={36} />
          <div style={{ fontSize: 18, fontWeight: 800, color: '#13294F' }}>Market<span style={{ color: '#16A34A' }}>Compass</span></div>
        </div>

        <div style={{ marginBottom: 8, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' }}>Znajdź swoją firmę</div>
        <div style={{ marginBottom: 32, fontSize: 14.5, color: '#6B7280' }}>Podaj nazwę firmy — zidentyfikujemy ją w rejestrach publicznych i przygotujemy analizę potencjału ekspansji zagranicznej.</div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmitForm();
          }}
          style={{ background: '#fff', border: '1px solid #E8E2D8', borderRadius: 16, padding: 26, marginBottom: 20 }}
        >
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="company-name" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1F2937', marginBottom: 6 }}>Nazwa firmy <span style={{ color: '#16A34A' }} aria-hidden="true">*</span></label>
            {/*
              Announced as required, but deliberately without a native `required`
              attribute: that would let the browser's own validation bubble
              preempt this form's Polish inline message.
            */}
            <input
              id="company-name"
              className="mc-input"
              value={form.name}
              onChange={(e) => onFieldChange('name', e.target.value)}
              placeholder="np. Nordic Furniture Co."
              aria-required="true"
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? 'company-name-error' : undefined}
              style={{ width: '100%', padding: '12px 14px', border: `1px solid ${nameBorder}`, borderRadius: 10, fontSize: 15 }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Opcjonalnie — zawęź wyszukiwanie</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label htmlFor="company-founded-year" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1F2937', marginBottom: 6 }}>Rok założenia</label>
              <input
                id="company-founded-year"
                className="mc-input"
                value={form.foundedYear}
                onChange={(e) => onFieldChange('foundedYear', e.target.value)}
                placeholder="np. 2016"
                inputMode="numeric"
                style={{ width: '100%', padding: '10px 13px', border: '1px solid #E8E2D8', borderRadius: 9, fontSize: 14 }}
              />
            </div>
            <div>
              <label htmlFor="company-krs" style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1F2937', marginBottom: 6 }}>Numer KRS</label>
              <input
                id="company-krs"
                className="mc-input"
                value={form.krs}
                onChange={(e) => onFieldChange('krs', e.target.value)}
                placeholder="np. 0000123456"
                aria-describedby="company-krs-hint"
                style={{ width: '100%', padding: '10px 13px', border: '1px solid #E8E2D8', borderRadius: 9, fontSize: 14 }}
              />
            </div>
          </div>
          {formError && (
            <div id="company-name-error" style={{ marginTop: 14, fontSize: 12.5, color: '#DC2626', fontWeight: 600 }}>{formError}</div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#16A34A0D', border: '1px solid #16A34A26', borderRadius: 12, padding: '14px 16px', margin: '20px 0' }}>
            <span style={{ fontSize: 16, lineHeight: 1.3 }} aria-hidden="true">✦</span>
            <div id="company-krs-hint" style={{ fontSize: 12.5, color: '#15803D', lineHeight: 1.5 }}>Numer KRS, jeśli go znasz, jest najsilniejszym identyfikatorem — pozwala jednoznacznie wskazać firmę bez konieczności wyszukiwania po nazwie.</div>
          </div>

          {apiError && (
            <div role="alert" style={{ marginBottom: 16, padding: '12px 14px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>{apiError}</div>
          )}

          <button type="submit" className="mc-submit-btn" style={{ width: '100%', background: '#15803D', color: '#fff', border: 'none', borderRadius: 12, padding: '16px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(22,163,74,0.25)' }}>Wyszukaj firmę i generuj analizę →</button>
        </form>

        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: '#4B5563', background: '#F3F4F6', borderRadius: 12, padding: '14px 16px' }}>
          Dane firmy oraz wyniki wyszukiwania są wykorzystywane wyłącznie do wygenerowania analizy ekspansji zagranicznej. MarketCompass nie przetwarza danych osób fizycznych.
        </div>
      </div>
    </div>
  );
}
