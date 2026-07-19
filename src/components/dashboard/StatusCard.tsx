import type { DashboardCompanyInfo } from "../../types";
import { deriveCompanyOverview } from "../../lib/companyOverview";
import type { CompanyOverviewItem } from "../../lib/companyOverview";
import CompanyDescriptionCard from "./CompanyDescriptionCard";

function ItemRow({ items, muted }: { items: CompanyOverviewItem[]; muted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{ display: 'flex', gap: 8, fontSize: muted ? 12.5 : 13, color: muted ? '#9CA3AF' : '#6B7280', lineHeight: 1.45 }}
        >
          <span style={{ color: muted ? '#9CA3AF' : '#16A34A', flexShrink: 0 }}>•</span>
          <span>
            <span style={{ color: muted ? '#6B7280' : '#374151', fontWeight: 600 }}>{item.label}:</span>{' '}
            {item.isLink ? (
              <a href={item.value} target="_blank" rel="noopener noreferrer">{item.value}</a>
            ) : (
              item.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function StatusCard({ company }: { company: DashboardCompanyInfo }) {
  const overview = deriveCompanyOverview(company);

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '22px 24px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>{company.legalName}</h2>

      <CompanyDescriptionCard description={overview.description} variant="inline" />

      {overview.metadata.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <ItemRow items={overview.metadata} />
        </div>
      )}

      {overview.registry.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
          <ItemRow items={overview.registry} muted />
        </div>
      )}
    </div>
  );
}
