import type { Company } from "../../types";

export default function StatusCard({ company }: { company: Company }) {
  const bullets = [
    { label: 'Branża', value: company.industry || '—' },
    company.products ? { label: 'Produkty', value: company.products } : null,
    company.foundedYear ? { label: 'Rok założenia', value: company.foundedYear } : null,
    company.employees ? { label: 'Pracownicy', value: company.employees + ' osób' } : null,
    company.expansionBudget ? { label: 'Budżet ekspansji', value: company.expansionBudget + ' PLN' } : null,
  ].filter((b): b is { label: string; value: string } => Boolean(b));

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', width: 616, height: 284 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', marginBottom: 10 }}>{company.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {bullets.map((b) => (
          <div key={b.label} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#6B7280', lineHeight: 1.45 }}>
            <span style={{ color: '#16A34A', flexShrink: 0 }}>•</span>
            <span><span style={{ color: '#374151', fontWeight: 600 }}>{b.label}:</span> {b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
