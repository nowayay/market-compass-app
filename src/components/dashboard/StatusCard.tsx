import type { DashboardCompanyInfo } from "../../types";

export default function StatusCard({ company }: { company: DashboardCompanyInfo }) {
  const bullets = [
    company.industry ? { label: 'Branża', value: company.industry } : null,
    company.krs ? { label: 'KRS', value: company.krs } : null,
    company.nip ? { label: 'NIP', value: company.nip } : null,
    company.regon ? { label: 'REGON', value: company.regon } : null,
    company.foundedYear ? { label: 'Rok założenia', value: String(company.foundedYear) } : null,
    company.website ? { label: 'Strona internetowa', value: company.website } : null,
  ].filter((b): b is { label: string; value: string } => Boolean(b));

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 14 }}>{company.legalName}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {bullets.map((b) => (
          <div key={b.label} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>
            <span style={{ color: '#16A34A', flexShrink: 0 }}>•</span>
            <span>
              <span style={{ color: '#374151', fontWeight: 600 }}>{b.label}:</span>{' '}
              {b.label === 'Strona internetowa' ? (
                <a href={b.value} target="_blank" rel="noopener noreferrer">{b.value}</a>
              ) : (
                b.value
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
