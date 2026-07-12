import type { ChangeEventHandler, KeyboardEventHandler } from "react";
import type { ChatMessage } from "../types";

export default function ChatModal({
  messages,
  input,
  onClose,
  onInputChange,
  onKeyDown,
  onSend,
}: {
  messages: ChatMessage[];
  input: string;
  onClose: () => void;
  onInputChange: ChangeEventHandler<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
  onSend: () => void;
}) {
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();
  const decorated = messages.map((m) => ({
    text: m.text,
    align: m.role === 'user' ? 'flex-end' : 'flex-start',
    bg: m.role === 'user' ? '#16A34A' : '#F3F4F6',
    color: m.role === 'user' ? '#FFFFFF' : '#111827',
  }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 70, display: 'flex', justifyContent: 'flex-end', animation: 'mc-fade-up .18s ease' }} onClick={onClose}>
      <div onClick={stopProp} style={{ width: 440, maxWidth: '94vw', height: '100%', background: '#fff', boxShadow: '-16px 0 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EDEFF2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#16A34A14', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✦</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>AI Chatbot</div>
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', width: 32, height: 32, borderRadius: 9, cursor: 'pointer', fontSize: 15, color: '#6B7280' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {decorated.map((m, i) => (
            <div key={i} style={{ alignSelf: m.align, maxWidth: '82%', background: m.bg, color: m.color, padding: '11px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{m.text}</div>
          ))}
        </div>
        <div style={{ padding: '16px 22px', borderTop: '1px solid #EDEFF2', display: 'flex', gap: 10 }}>
          <input
            className="mc-input"
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder="Zadaj pytanie o rynki…"
            style={{ flex: 1, padding: '11px 14px', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 13, outline: 'none' }}
          />
          <button onClick={onSend} style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Wyślij</button>
        </div>
      </div>
    </div>
  );
}
