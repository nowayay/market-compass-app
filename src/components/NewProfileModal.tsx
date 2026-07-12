import type { ChangeEventHandler } from "react";

export default function NewProfileModal({
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(31,41,55,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, animation: 'mc-fade-up .15s ease' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Nowy profil firmy</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Podaj nazwę, aby rozpocząć uzupełnianie profilu firmy.</div>
        <input
          className="mc-input"
          value={value}
          onChange={onChange}
          placeholder="np. Atlas Robotics Sp. z o.o."
          autoFocus
          style={{ width: '100%', padding: '11px 14px', border: '1px solid #E8E2D8', borderRadius: 10, fontSize: 14, outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onCancel} style={{ flex: 1, background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 9, padding: '11px 0', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Anuluj</button>
          <button onClick={onConfirm} style={{ flex: 1, background: '#16A34A', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 0', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Utwórz profil</button>
        </div>
      </div>
    </div>
  );
}
