export default function CompanyDescriptionCard({
  description,
  variant = 'card',
}: {
  description?: string;
  /** 'card': standalone bordered card. 'inline': plain text, for embedding inside another card. */
  variant?: 'card' | 'inline';
}) {
  if (!description) return null;

  if (variant === 'inline') {
    return (
      <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, marginTop: 10 }}>{description}</div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 10 }}>Opis działalności</div>
      <div style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6 }}>{description}</div>
    </div>
  );
}
