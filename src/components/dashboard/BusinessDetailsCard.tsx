function BulletColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 10 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>Brak danych</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, fontSize: 12.5, color: '#1F2937', lineHeight: 1.4 }}>
              <span style={{ color: '#16A34A' }}>•</span>{item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BusinessDetailsCard({
  productsServices,
  customerSegments,
  operatingMarkets,
}: {
  productsServices: string[];
  customerSegments: string[];
  operatingMarkets: string[];
}) {
  if (productsServices.length === 0 && customerSegments.length === 0 && operatingMarkets.length === 0) {
    return null;
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #EDEFF2', borderRadius: 16, padding: '20px 22px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 16 }}>Profil działalności</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 20 }}>
        <BulletColumn title="Produkty i usługi" items={productsServices} />
        <BulletColumn title="Segmenty klientów" items={customerSegments} />
        <BulletColumn title="Rynki działania" items={operatingMarkets} />
      </div>
    </div>
  );
}
