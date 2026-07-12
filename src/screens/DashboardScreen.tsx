import type { MouseEvent } from "react";
import type { AppState, DecoratedResult } from "../types";
import Sidebar from '../components/dashboard/Sidebar';
import ScoreCard from '../components/dashboard/ScoreCard';
import StatusCard from '../components/dashboard/StatusCard';
import TopThreeGrid from '../components/dashboard/TopThreeGrid';
import WorldMap from '../components/dashboard/WorldMap';
import RankingList from '../components/dashboard/RankingList';
import SwotQuadrants from '../components/dashboard/SwotQuadrants';

export default function DashboardScreen({
  state, results,
  onOpenChat, onOpenExampleQuestion, onOpenCountry, onOpenMapFull, onToggleAllRanking,
  onToggleProfileMenu, onEditProfile, onBackToProfiles,
}: {
  state: AppState;
  results: DecoratedResult[];
  onOpenChat: () => void;
  onOpenExampleQuestion: (question: string) => void;
  onOpenCountry: (id: string) => void;
  onOpenMapFull: (e: MouseEvent) => void;
  onToggleAllRanking: (e: MouseEvent) => void;
  onToggleProfileMenu: () => void;
  onEditProfile: () => void;
  onBackToProfiles: () => void;
}) {
  const { company, companyScore, worldFeatures, mapReady, mapZoom, showAllRanking, profileMenuOpen, swot } = state;
  const companyInitial = (company.name || '?').charAt(0).toUpperCase();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FAFBFC', animation: 'mc-fade-up .4s ease' }}>
      <Sidebar onOpenChat={onOpenChat} onOpenExampleQuestion={onOpenExampleQuestion} />

      <main style={{ flex: 1, minWidth: 0, padding: '26px 34px 70px', maxWidth: 1300 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 26 }}>
          <div>
            <div style={{ fontSize: 20, color: '#000000', marginTop: 4, fontWeight: 800 }}>Oto przegląd Twojej analizy rynków</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <button onClick={onToggleProfileMenu} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#16A34A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>{companyInitial}</div>
              <span style={{ color: '#6B7280', fontSize: 12 }}>▾</span>
            </button>
            {profileMenuOpen && (
              <div style={{ position: 'absolute', top: 52, right: 0, background: '#fff', border: '1px solid #EDEFF2', borderRadius: 12, boxShadow: '0 10px 30px rgba(16,24,40,0.12)', overflow: 'hidden', zIndex: 30, minWidth: 180, animation: 'mc-pop .12s ease' }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #F1F3F5' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{company.name}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF' }}>{company.industry}</div>
                </div>
                <button className="mc-dropdown-row" onClick={onEditProfile} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: 'none', border: 'none', fontSize: 13, color: '#374151', cursor: 'pointer' }}>Edytuj profil firmy</button>
                <button className="mc-dropdown-row" onClick={onBackToProfiles} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: 'none', border: 'none', fontSize: 13, color: '#374151', cursor: 'pointer', borderTop: '1px solid #F1F3F5' }}>Zmień profil</button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 18, marginBottom: 26 }}>
          <ScoreCard companyScore={companyScore} />
          <StatusCard company={company} />
        </div>

        <TopThreeGrid results={results} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 26, alignItems: 'start' }}>
          <WorldMap mapReady={mapReady} worldFeatures={worldFeatures} results={results} mapZoom={mapZoom} onOpenMapFull={onOpenMapFull} />
          <RankingList results={results} showAllRanking={showAllRanking} onToggleAllRanking={onToggleAllRanking} onOpenCountry={onOpenCountry} />
        </div>

        <SwotQuadrants swot={swot} />
      </main>
    </div>
  );
}
