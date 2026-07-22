"use client";

import type { CompanyProfileEntry } from "../types";
import CompassLogo from "../components/CompassLogo";

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ProfilesScreen({
  profiles,
  openMenuId,
  deleteTargetId,
  onSelectProfile,
  onNewProfile,
  onToggleMenu,
  onCloseMenu,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  profiles: CompanyProfileEntry[];
  openMenuId: string | null;
  deleteTargetId: string | null;
  onSelectProfile: (id: string) => void;
  onNewProfile: () => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const deleteTarget = profiles.find((p) => p.id === deleteTargetId) ?? null;

  return (
    <div style={{ minHeight: '100vh', padding: '36px 20px 80px', animation: 'mc-fade-up .4s ease' }} onClick={onCloseMenu}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CompassLogo size={36} />
            <div style={{ fontSize: 18, fontWeight: 800, color: '#13294F' }}>Market<span style={{ color: '#16A34A' }}>Compass</span></div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onNewProfile(); }}
            className="mc-submit-btn"
            style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(22,163,74,0.25)' }}
          >
            + Nowy profil firmy
          </button>
        </div>

        <div style={{ marginBottom: 8, fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', color: '#111827' }}>Twoje profile firm</div>
        <div style={{ marginBottom: 28, fontSize: 14.5, color: '#6B7280' }}>Wybierz zapisany profil, aby wrócić do jego analizy, lub rozpocznij nowy.</div>

        {profiles.length === 0 ? (
          <div style={{ background: '#fff', border: '1px dashed #E5E7EB', borderRadius: 16, padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13.5 }}>
            Nie masz jeszcze żadnych zapisanych profili firm.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {profiles.map((p) => (
              <div
                key={p.id}
                onClick={() => onSelectProfile(p.id)}
                className="mc-profile-card"
                style={{ position: 'relative', textAlign: 'left', background: '#fff', border: '1px solid #E8E2D8', borderRadius: 14, padding: 18, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{p.dashboard.company.legalName}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleMenu(p.id); }}
                    aria-label="Menu profilu"
                    style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 18, cursor: 'pointer', padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}
                  >
                    ⋯
                  </button>
                  {openMenuId === p.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{ position: 'absolute', top: 40, right: 14, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(16,24,40,0.12)', overflow: 'hidden', zIndex: 5, minWidth: 150 }}
                    >
                      <button
                        onClick={() => onRequestDelete(p.id)}
                        className="mc-menu-item-danger"
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 14px', fontSize: 12.5, color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Usuń profil
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DCFCE7', color: '#16803C', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', display: 'inline-block' }} />
                  Analiza ukończona
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#6B7280' }}>
                  <div>KRS: {p.dashboard.company.krs ?? '—'}</div>
                  <div>Ostatnia analiza: {formatSavedAt(p.savedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'mc-fade-up .18s ease' }}
          onClick={(e) => { e.stopPropagation(); onCancelDelete(); }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width: 'min(420px,90vw)', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 8 }}>Usunąć profil?</div>
            <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 22 }}>
              Profil <strong>{deleteTarget.dashboard.company.legalName}</strong> zostanie trwale usunięty z tego urządzenia. Tej operacji nie można cofnąć.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={onCancelDelete} style={{ background: '#F3F4F6', border: 'none', color: '#374151', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Anuluj</button>
              <button onClick={onConfirmDelete} style={{ background: '#DC2626', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Usuń profil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
