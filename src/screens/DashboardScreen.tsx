import type { MouseEvent } from "react";
import type { DashboardCompletedResponse, DecoratedCountry, WorldFeature } from "../types";
import Sidebar from '../components/dashboard/Sidebar';
import StatusCard from '../components/dashboard/StatusCard';
import BusinessDetailsCard from '../components/dashboard/BusinessDetailsCard';
import WorldMap from '../components/dashboard/WorldMap';
import RankingList from '../components/dashboard/RankingList';
import TopExpansionCard from '../components/dashboard/TopExpansionCard';
import SwotQuadrants from '../components/dashboard/SwotQuadrants';
import SourcesList from '../components/dashboard/SourcesList';

export default function DashboardScreen({
  dashboard,
  countries,
  worldFeatures,
  mapReady,
  onOpenChat,
  onOpenExampleQuestion,
  onSelectCountry,
  onOpenMapFull,
  onNewAnalysis,
  onBackToProfiles,
}: {
  dashboard: DashboardCompletedResponse;
  countries: DecoratedCountry[];
  worldFeatures: WorldFeature[];
  mapReady: boolean;
  onOpenChat: () => void;
  onOpenExampleQuestion: (question: string) => void;
  onSelectCountry: (countryCode: string) => void;
  onOpenMapFull: (e: MouseEvent) => void;
  onNewAnalysis: () => void;
  onBackToProfiles: () => void;
}) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#FAFBFC', animation: 'mc-fade-up .4s ease' }}>
      <Sidebar onOpenChat={onOpenChat} onOpenExampleQuestion={onOpenExampleQuestion} />

      <main style={{ flex: 1, minWidth: 0, padding: '26px 34px 70px', maxWidth: 1300 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 26 }}>
          <div style={{ fontSize: 20, color: '#000000', marginTop: 4, fontWeight: 800 }}>Przegląd analizy ekspansji</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onBackToProfiles}
              style={{ background: '#fff', border: '1px solid #E5E7EB', color: '#374151', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              ← Wróć do profili
            </button>
            <button
              onClick={onNewAnalysis}
              style={{ background: '#fff', border: '1px solid #E5E7EB', color: '#374151', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              + Nowa analiza
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18, marginBottom: 26 }}>
          <StatusCard company={dashboard.company} />
          <BusinessDetailsCard
            productsServices={dashboard.company.productsServices}
            customerSegments={dashboard.company.customerSegments}
            operatingMarkets={dashboard.company.operatingMarkets}
          />
        </div>

        <div className="mc-analysis-grid">
          <div className="mc-col-left">
            <WorldMap
              mapReady={mapReady}
              worldFeatures={worldFeatures}
              countries={countries}
              onSelectCountry={onSelectCountry}
              onOpenMapFull={onOpenMapFull}
            />
            <SwotQuadrants swot={dashboard.expansion.swot} />
            <SourcesList sources={dashboard.sources} />
          </div>
          <div className="mc-col-right">
            {countries.length > 0 && (
              <TopExpansionCard country={countries[0]} onSelectCountry={onSelectCountry} />
            )}
            <RankingList countries={countries} onSelectCountry={onSelectCountry} />
          </div>
        </div>
      </main>
    </div>
  );
}
