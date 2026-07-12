export default function AnalyzingScreen({
  stepLabel,
  progressPct,
}: {
  stepLabel: string;
  progressPct: number;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: '#16A34A', animation: 'mc-spin 0.9s linear infinite', marginBottom: 30 }} />
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Analizujemy potencjał ekspansji…</div>
      <div style={{ fontSize: 13.5, color: '#6B7280', marginBottom: 28 }}>{stepLabel}</div>
      <div style={{ width: 280, height: 6, background: '#E5E7EB', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: '#16A34A', borderRadius: 6, width: `${progressPct}%`, transition: 'width .5s ease' }} />
      </div>
    </div>
  );
}
