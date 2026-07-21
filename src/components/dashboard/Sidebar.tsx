import CompassLogo from '../CompassLogo';

const EXAMPLE_QUESTIONS = [
  'Które kraje są najlepsze dla mojej branży?',
  'Jakie ryzyka wiążą się z wejściem na rynek azjatycki?',
  'Porównaj rynek w Niemczech i we Francji',
  'Jakie są koszty wejścia na rynek w USA?',
];

export default function Sidebar({
  onOpenChat,
  onOpenExampleQuestion,
}: {
  onOpenChat: () => void;
  onOpenExampleQuestion: (question: string) => void;
}) {
  return (
    <aside style={{ width: 264, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #EDEFF2', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 22, alignSelf: 'stretch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <CompassLogo size={72} />
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#13294F', textAlign: 'center' }}>Market<span style={{ color: '#16A34A' }}>Compass</span></div>
      </div>

      <div style={{ border: '1px solid #EDEFF2', borderRadius: 16, padding: 18, boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#16A34A14', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>✦</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>AI Chatbot</div>
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, marginBottom: 14 }}>Zapytaj o rynki, analizy, strategie lub poproś o rekomendacje.</div>
        <button className="mc-chat-cta" onClick={onOpenChat} style={{ width: '100%', border: '1.5px solid #16A34A', background: '#fff', color: '#16A34A', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Rozpocznij rozmowę</button>

        <div style={{ height: 1, background: '#EDEFF2', margin: '16px -18px' }} />
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Przykładowe pytania</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              className="mc-example-q"
              onClick={() => onOpenExampleQuestion(q)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', border: '1px solid #EDEFF2', background: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#374151', cursor: 'pointer', lineHeight: 1.35 }}
            >
              <span>{q}</span>
              <span style={{ color: '#9CA3AF', flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
