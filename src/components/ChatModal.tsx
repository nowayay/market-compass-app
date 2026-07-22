"use client";

import { useEffect, useRef } from "react";
import type { ChangeEventHandler, KeyboardEvent } from "react";
import type { ChatMessage } from "../types";
import { sanitizeChatPlainText } from "../lib/ai/plainText";

/** Three animated dots shown in the AI bubble while a response is generating. */
function TypingDots() {
  return (
    <div role="status" aria-label="MarketCompassAI pisze odpowiedź…" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 0' }}>
      <span className="mc-typing-dot" style={{ animationDelay: '0s' }} />
      <span className="mc-typing-dot" style={{ animationDelay: '0.15s' }} />
      <span className="mc-typing-dot" style={{ animationDelay: '0.3s' }} />
    </div>
  );
}

export default function ChatModal({
  messages,
  input,
  isGenerating,
  error,
  onClose,
  onInputChange,
  onSend,
  onStop,
}: {
  messages: ChatMessage[];
  input: string;
  isGenerating: boolean;
  error: string | null;
  onClose: () => void;
  onInputChange: ChangeEventHandler<HTMLInputElement>;
  onSend: () => void;
  onStop: () => void;
}) {
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message (and streamed text) in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isGenerating]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter sends; submission is blocked while a response is generating.
    if (e.key === "Enter") {
      e.preventDefault();
      if (!isGenerating) onSend();
    }
  };

  const decorated = messages.map((m, i) => ({
    text: m.text,
    role: m.role,
    truncated: m.truncated === true,
    align: m.role === 'user' ? 'flex-end' : 'flex-start',
    bg: m.role === 'user' ? '#16A34A' : '#F3F4F6',
    color: m.role === 'user' ? '#FFFFFF' : '#111827',
    // The streamed placeholder is the last message; show dots only until its
    // first text fragment arrives (an error/stop drops the placeholder outright).
    showTyping: isGenerating && i === messages.length - 1 && m.role === 'assistant' && m.text.length === 0,
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
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {decorated.map((m, i) => (
            <div key={i} style={{ alignSelf: m.align, maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ background: m.bg, color: m.color, padding: '11px 14px', borderRadius: 14, fontSize: 13, lineHeight: 1.55 }}>
                {m.showTyping ? (
                  <TypingDots />
                ) : m.role === 'assistant' ? (
                  // Plain text only, with line breaks preserved. A sanitizer
                  // strips any stray Markdown/table rows the model may emit.
                  <span style={{ whiteSpace: 'pre-wrap' }}>{sanitizeChatPlainText(m.text)}</span>
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
                )}
              </div>
              {m.truncated && (
                <div style={{ fontSize: 11.5, color: '#9CA3AF', paddingLeft: 4 }}>Odpowiedź została skrócona</div>
              )}
            </div>
          ))}
        </div>
        {error && (
          <div role="alert" style={{ margin: '0 22px', padding: '10px 14px', background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5 }}>{error}</div>
        )}
        <div style={{ padding: '16px 22px', borderTop: '1px solid #EDEFF2', display: 'flex', gap: 10 }}>
          <input
            className="mc-input"
            value={input}
            onChange={onInputChange}
            onKeyDown={handleKeyDown}
            maxLength={4000}
            placeholder="Zadaj pytanie o rynki…"
            style={{ flex: 1, padding: '11px 14px', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 13, outline: 'none' }}
          />
          {isGenerating ? (
            <button
              onClick={onStop}
              aria-label="Zatrzymaj generowanie odpowiedzi"
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Zatrzymaj
            </button>
          ) : (
            <button
              onClick={onSend}
              style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Wyślij
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
