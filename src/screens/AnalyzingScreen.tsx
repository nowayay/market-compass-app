export default function AnalyzingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: '#16A34A', animation: 'mc-spin 0.9s linear infinite', marginBottom: 30 }} />
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1F2937', marginBottom: 8 }}>Analizujemy potencjał ekspansji…</div>
      <div style={{ fontSize: 13.5, color: '#6B7280' }}>Identyfikujemy firmę, zbieramy jej profil i generujemy rekomendacje AI. To może potrwać do minuty.</div>
    </div>
  );
}
