import type { ChangeEventHandler, MouseEvent } from "react";
import type { AppState, Profile } from "../types";
import CompassLogo from '../components/CompassLogo';

interface ProfileCardHandlers {
  onEnterProfile: (p: Profile | { id: string; name: string }) => void;
  onToggleMenu: (id: string) => void;
  onStartRename: (p: Profile) => void;
  onCancelRename: () => void;
  onRenameChange: ChangeEventHandler<HTMLInputElement>;
  onConfirmRename: () => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function ProfileCard({
  p, state, onEnterProfile, onToggleMenu, onStartRename, onCancelRename, onRenameChange, onConfirmRename, onAskDelete, onCancelDelete, onConfirmDelete,
}: ProfileCardHandlers & { p: Profile; state: AppState }) {
  const menuOpen = state.menuOpenId === p.id;
  const renaming = state.renamingId === p.id;
  const confirmingDelete = state.deleteConfirmId === p.id;
  const initial = p.name.trim().charAt(0).toUpperCase();
  const statusLabel = p.hasAnalysis ? `Ostatnia aktywność: ${p.lastActive}` : 'Profil niekompletny';
  const badgeText = p.hasAnalysis ? 'Analiza gotowa' : 'Uzupełnij dane';
  const badgeBg = p.hasAnalysis ? '#DCFCE7' : '#FEF3C7';
  const badgeColor = p.hasAnalysis ? '#15803D' : '#B45309';
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div
      className="mc-profile-card"
      style={{ width: 220, background: '#FFFFFF', border: '1px solid #E8E2D8', borderRadius: 16, padding: 22, boxShadow: '0 1px 3px rgba(30,58,95,0.06)', cursor: 'pointer', position: 'relative', transition: 'box-shadow .15s, transform .15s' }}
      onClick={() => onEnterProfile(p)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: p.avatarColor + '1A', color: p.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>{initial}</div>
        <button
          className="mc-icon-btn"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(p.id); }}
          style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 6, lineHeight: 1 }}
        >⋯</button>
      </div>

      {renaming && (
        <div onClick={stop} style={{ marginTop: 16 }}>
          <input
            className="mc-input"
            value={state.renameValue}
            onChange={onRenameChange}
            autoFocus
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #16A34A', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#1F2937', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); onConfirmRename(); }} style={{ flex: 1, background: '#16A34A', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Zapisz</button>
            <button onClick={(e) => { e.stopPropagation(); onCancelRename(); }} style={{ flex: 1, background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 7, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Anuluj</button>
          </div>
        </div>
      )}
      {!renaming && (
        <>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: '#1F2937' }}>{p.name}</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: '#6B7280' }}>{statusLabel}</div>
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 20, background: badgeBg, color: badgeColor }}>{badgeText}</div>
        </>
      )}

      {menuOpen && (
        <div onClick={stop} style={{ position: 'absolute', top: 56, right: 16, background: '#fff', border: '1px solid #E8E2D8', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', zIndex: 5, minWidth: 150, animation: 'mc-pop .12s ease' }}>
          <button className="mc-menu-item" onClick={(e) => { e.stopPropagation(); onStartRename(p); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', fontSize: 13, color: '#1F2937', cursor: 'pointer' }}>Zmień nazwę</button>
          <button className="mc-menu-item-danger" onClick={(e) => { e.stopPropagation(); onAskDelete(p.id); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', fontSize: 13, color: '#EF4444', cursor: 'pointer', borderTop: '1px solid #F1EEE7' }}>Usuń profil</button>
        </div>
      )}

      {confirmingDelete && (
        <div onClick={stop} style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.97)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center', zIndex: 6 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1F2937', marginBottom: 14 }}>Usunąć profil „{p.name}”?</div>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <button onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }} style={{ flex: 1, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Usuń</button>
            <button onClick={(e) => { e.stopPropagation(); onCancelDelete(); }} style={{ flex: 1, background: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 7, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Anuluj</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfileSelectScreen({
  state, onEnterProfile, onOpenNewProfile,
  onToggleMenu, onStartRename, onCancelRename, onRenameChange, onConfirmRename,
  onAskDelete, onCancelDelete, onConfirmDelete,
}: ProfileCardHandlers & { state: AppState; onOpenNewProfile: () => void }) {
  const guestProfile = { id: 'guest', name: 'Gość' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', animation: 'mc-fade-up .5s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <CompassLogo size={46} />
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: '#13294F' }}>Market<span style={{ color: '#16A34A' }}>Compass</span></div>
      </div>
      <div style={{ color: '#6B7280', fontSize: 15, marginBottom: 44 }}>Wybierz profil, aby kontynuować analizę ekspansji</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', maxWidth: 940 }}>
        {state.profiles.map((p) => (
          <ProfileCard
            key={p.id}
            p={p}
            state={state}
            onEnterProfile={onEnterProfile}
            onToggleMenu={onToggleMenu}
            onStartRename={onStartRename}
            onCancelRename={onCancelRename}
            onRenameChange={onRenameChange}
            onConfirmRename={onConfirmRename}
            onAskDelete={onAskDelete}
            onCancelDelete={onCancelDelete}
            onConfirmDelete={onConfirmDelete}
          />
        ))}

        <div
          className="mc-profile-card"
          style={{ width: 220, background: '#FFFFFF', border: '1px solid #E8E2D8', borderRadius: 16, padding: 22, boxShadow: '0 1px 3px rgba(30,58,95,0.06)', cursor: 'pointer' }}
          onClick={() => onEnterProfile(guestProfile)}
        >
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F3F4F6', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>G</div>
          <div style={{ marginTop: 16, fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Gość</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: '#6B7280' }}>Sesja tymczasowa, dane nie są zapisywane</div>
        </div>

        <div
          className="mc-new-profile-tile"
          style={{ width: 220, border: '1.5px dashed #C9C0AE', borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', minHeight: 172 }}
          onClick={onOpenNewProfile}
        >
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#16A34A1A', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 600 }}>+</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#16A34A' }}>Nowy profil firmy</div>
        </div>
      </div>
    </div>
  );
}
