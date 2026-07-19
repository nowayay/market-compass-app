import type { ResearchSource } from "../../contracts/companyResearch";

const PROVIDER_LABEL: Record<ResearchSource["provider"], string> = {
  krs: "Krajowy Rejestr Sądowy",
  openai_web_search: "Wyszukiwanie internetowe (AI)",
};

export default function SourcesList({ sources }: { sources: ResearchSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 14 }}>Źródła</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sources.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: '#374151', borderBottom: '1px solid #F5F6F8', paddingBottom: 8 }}>
            <span>{PROVIDER_LABEL[s.provider]}{s.domain ? ` — ${s.domain}` : ''}</span>
            {s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>Otwórz ↗</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
