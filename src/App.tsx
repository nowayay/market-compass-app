"use client";

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent, MouseEvent } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import {
  DEFAULT_PROFILES,
  analyzeAllCountries,
  computeCompanyScore,
  generateSWOT,
  inferCompanyProfile,
} from './data/marketData';
import { decorateResult } from './lib/derive';
import type { AppState, ChatMessage, Company, Profile } from './types';
import ProfileSelectScreen from './screens/ProfileSelectScreen';
import CompanyFormScreen from './screens/CompanyFormScreen';
import AnalyzingScreen from './screens/AnalyzingScreen';
import DashboardScreen from './screens/DashboardScreen';
import NewProfileModal from './components/NewProfileModal';
import MapFullModal from './components/MapFullModal';
import ChatModal from './components/ChatModal';
import CountryDetailModal from './components/CountryDetailModal';

const STORAGE_KEY = 'marketcompass_profiles_v1';

function emptyCompany(): Company {
  return { name: '', industry: '', country: '', foundedYear: '', employees: '', products: '', customerType: '', annualRevenue: '', expansionBudget: '', regions: [], riskLevel: '', goal: '', krs: '' };
}

// Next.js pre-renders client components on the server too, where `localStorage`
// doesn't exist — so the initial render must not depend on it. The real,
// possibly-persisted profile list is loaded client-side in a useEffect below.
function persist(profiles: Profile[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)); } catch { /* ignore */ }
}

const ANALYZE_STEP_LABELS = [
  'Wyszukiwanie firmy w rejestrach i źródłach publicznych…',
  'Pobieranie danych firmy i profilu działalności…',
  'Ocena wskaźników gospodarczych 30 rynków…',
  'Dopasowanie strategii wejścia…',
  'Generowanie rekomendacji AI…',
];

const initialState: AppState = {
  screen: 'profiles',
  profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
  activeProfileId: null,
  company: emptyCompany(),
  results: [],
  swot: null,
  companyScore: 0,
  selectedCountryId: null,
  newProfileOpen: false,
  newProfileName: '',
  renamingId: null,
  renameValue: '',
  menuOpenId: null,
  deleteConfirmId: null,
  nameMissing: false,
  analyzeStep: 0,
  showAllRanking: false,
  mapZoom: 1,
  mapFull: false,
  mapReady: false,
  worldFeatures: [],
  profileMenuOpen: false,
  chatOpen: false,
  chatMessages: [],
  chatInput: '',
};

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = (updates: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
    setState((s) => ({ ...s, ...(typeof updates === 'function' ? updates(s) : updates) }));

  // Client-only: pick up any previously saved profiles from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) patch({ profiles: JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json');
        const geo = await res.json() as FeatureCollection;
        const width = 960, height = 470;
        const projection = geoNaturalEarth1().fitSize([width, height], geo);
        const pathGen = geoPath(projection);
        const worldFeatures = geo.features
          .map((f) => ({ iso3: String(f.id ?? ''), d: pathGen(f) ?? '' }))
          .filter((f) => f.d);
        if (!cancelled) patch({ worldFeatures, mapReady: true });
      } catch {
        if (!cancelled) patch({ mapReady: false });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- profile select ----
  function enterProfile(p: Profile | { id: string; name: string }) {
    if (p.id === 'guest') {
      patch({ screen: 'form', activeProfileId: 'guest', company: emptyCompany() });
      return;
    }
    const profile = p as Profile;
    if (profile.hasAnalysis && profile.company) {
      const results = analyzeAllCountries(profile.company);
      const swot = generateSWOT(profile.company, results);
      const score = computeCompanyScore(profile.company, results);
      patch({ screen: 'dashboard', activeProfileId: profile.id, company: profile.company, results, swot, companyScore: score });
    } else {
      patch({ screen: 'form', activeProfileId: profile.id, company: profile.company || emptyCompany() });
    }
  }

  const openNewProfile = () => patch({ newProfileOpen: true, newProfileName: '' });
  const cancelNewProfile = () => patch({ newProfileOpen: false });
  const onNewProfileNameChange = (e: ChangeEvent<HTMLInputElement>) => patch({ newProfileName: e.target.value });
  function confirmNewProfile() {
    const name = stateRef.current.newProfileName.trim() || 'Nowa firma';
    const id = 'p' + Date.now();
    const colors = ['#16A34A', '#2563EB', '#F59E0B', '#6B7280'];
    const profile: Profile = { id, name, avatarColor: colors[stateRef.current.profiles.length % colors.length], lastActive: 'teraz', hasAnalysis: false, company: null };
    const profiles = [...stateRef.current.profiles, profile];
    persist(profiles);
    patch({ profiles, newProfileOpen: false, screen: 'form', activeProfileId: id, company: emptyCompany() });
  }

  const toggleMenu = (id: string) => patch((s) => ({ menuOpenId: s.menuOpenId === id ? null : id }));
  const startRename = (p: Profile) => patch({ renamingId: p.id, renameValue: p.name, menuOpenId: null });
  const cancelRename = () => patch({ renamingId: null });
  const onRenameChange = (e: ChangeEvent<HTMLInputElement>) => patch({ renameValue: e.target.value });
  function confirmRename() {
    const profiles = stateRef.current.profiles.map((p) => (p.id === stateRef.current.renamingId ? { ...p, name: stateRef.current.renameValue.trim() || p.name } : p));
    persist(profiles);
    patch({ profiles, renamingId: null });
  }
  const askDelete = (id: string) => patch({ deleteConfirmId: id, menuOpenId: null });
  const cancelDelete = () => patch({ deleteConfirmId: null });
  function confirmDelete() {
    const profiles = stateRef.current.profiles.filter((p) => p.id !== stateRef.current.deleteConfirmId);
    persist(profiles);
    patch({ profiles, deleteConfirmId: null });
  }

  // ---- company form ----
  const updateField = (field: keyof Company, value: string) => patch((s) => ({ company: { ...s.company, [field]: value } }));
  const backToProfiles = () => patch({ screen: 'profiles', menuOpenId: null, selectedCountryId: null, profileMenuOpen: false });
  const editProfile = () => patch({ screen: 'form', profileMenuOpen: false });

  function submitForm() {
    if (!stateRef.current.company.name || !stateRef.current.company.name.trim()) {
      patch({ nameMissing: true });
      return;
    }
    const inferred = inferCompanyProfile({
      name: stateRef.current.company.name,
      foundedYear: stateRef.current.company.foundedYear,
      krs: stateRef.current.company.krs,
    });
    patch({ screen: 'analyzing', analyzeStep: 0, nameMissing: false, company: inferred });
    runAnalysis();
  }

  function runAnalysis() {
    const total = 5;
    const tick = (i: number) => {
      patch({ analyzeStep: i });
      if (i < total) {
        setTimeout(() => tick(i + 1), 650);
      } else {
        setTimeout(() => {
          const company = stateRef.current.company;
          const results = analyzeAllCountries(company);
          const swot = generateSWOT(company, results);
          const score = computeCompanyScore(company, results);
          const activeId = stateRef.current.activeProfileId;
          let profiles = stateRef.current.profiles;
          if (activeId && activeId !== 'guest') {
            profiles = profiles.map((p) => (p.id === activeId ? { ...p, hasAnalysis: true, company, lastActive: 'teraz' } : p));
            persist(profiles);
          }
          patch({ screen: 'dashboard', results, swot, companyScore: score, profiles });
        }, 500);
      }
    };
    setTimeout(() => tick(1), 650);
  }

  // ---- dashboard ----
  const openCountry = (id: string) => patch({ selectedCountryId: id });
  const closeCountry = () => patch({ selectedCountryId: null });
  const toggleAllRanking = (e?: MouseEvent) => { if (e) e.preventDefault(); patch((s) => ({ showAllRanking: !s.showAllRanking })); };
  const openMapFull = (e?: MouseEvent) => { if (e) e.preventDefault(); patch({ mapFull: true }); };
  const closeMapFull = () => patch({ mapFull: false });
  const toggleProfileMenu = () => patch((s) => ({ profileMenuOpen: !s.profileMenuOpen }));

  function chatReply(q: string): string {
    const s = stateRef.current;
    const top = (s.results || []).slice(0, 3).map((r) => `${r.country.name} (${r.score}/100)`);
    const topLine = top.length ? top.join(', ') : 'brak danych';
    const low = q.toLowerCase();
    if (low.includes('niemc') || low.includes('francj')) {
      const de = s.results.find((r) => r.country.id === 'de');
      const fr = s.results.find((r) => r.country.id === 'fr');
      if (de && fr) return `Porównanie:\n• Niemcy — ${de.score}/100, ryzyko ${de.risk.toLowerCase()}, bardzo duży rynek, ale wysoka konkurencja.\n• Francja — ${fr.score}/100, ryzyko ${fr.risk.toLowerCase()}, stabilny popyt.\nDla Twojego profilu ${de.score >= fr.score ? 'Niemcy' : 'Francja'} wypada nieco lepiej.`;
    }
    if (low.includes('azjat') || low.includes('azj')) {
      return `Rynki azjatyckie w Twojej analizie oferują duży potencjał wzrostu, ale wiążą się z wyższym ryzykiem regulacyjnym i kursowym. Zwróć uwagę na bariery celne i lokalną konkurencję. Rozważ wejście przez lokalnego dystrybutora.`;
    }
    if (low.includes('usa') || low.includes('stan')) {
      const us = s.results.find((r) => r.country.id === 'us');
      return us ? `Wejście na rynek USA (${us.score}/100): to największy rynek świata, ale bardzo konkurencyjny. Przewidywany poziom inwestycji: ${us.investmentLevel.toLowerCase()} (${us.investmentRange}). Rekomendowana strategia: ${us.strategy}.` : `Rynek USA to największy, ale i najbardziej konkurencyjny rynek świata.`;
    }
    return `Na podstawie profilu Twojej firmy najlepiej dopasowane rynki to: ${topLine}. Chcesz, żebym rozwinął strategię wejścia dla któregoś z nich?`;
  }

  function openChat(question: string | null) {
    const msgs: ChatMessage[] = [{ role: 'assistant', text: 'Cześć! Jestem asystentem MarketCompass. Zapytaj mnie o dowolny rynek, ryzyko, strategię ekspansji lub on informacje na temat danego przedsiębiorstwa.\n' }];
    if (question) {
      msgs.push({ role: 'user' as const, text: question });
      msgs.push({ role: 'assistant' as const, text: chatReply(question) });
    }
    patch({ chatOpen: true, chatMessages: msgs, chatInput: '' });
  }
  const closeChat = () => patch({ chatOpen: false });
  const onChatInputChange = (e: ChangeEvent<HTMLInputElement>) => patch({ chatInput: e.target.value });
  const onChatKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') sendChat(); };
  function sendChat() {
    const q = stateRef.current.chatInput.trim();
    if (!q) return;
    const msgs = [...stateRef.current.chatMessages, { role: 'user' as const, text: q }, { role: 'assistant' as const, text: chatReply(q) }];
    patch({ chatMessages: msgs, chatInput: '' });
  }

  const decoratedResults = state.results.map((r) => decorateResult(r, openCountry));
  const selectedResult = decoratedResults.find((r) => r.id === state.selectedCountryId) || null;

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#FAF8F4', color: '#1F2937', position: 'relative', overflowX: 'hidden' }}>
      {state.screen === 'profiles' && (
        <ProfileSelectScreen
          state={state}
          onEnterProfile={enterProfile}
          onOpenNewProfile={openNewProfile}
          onToggleMenu={toggleMenu}
          onStartRename={startRename}
          onCancelRename={cancelRename}
          onRenameChange={onRenameChange}
          onConfirmRename={confirmRename}
          onAskDelete={askDelete}
          onCancelDelete={cancelDelete}
          onConfirmDelete={confirmDelete}
        />
      )}

      {state.screen === 'form' && (
        <CompanyFormScreen
          company={state.company}
          nameMissing={state.nameMissing}
          onFieldChange={updateField}
          onBackToProfiles={backToProfiles}
          onSubmitForm={submitForm}
        />
      )}

      {state.screen === 'analyzing' && (
        <AnalyzingScreen
          stepLabel={ANALYZE_STEP_LABELS[Math.min(state.analyzeStep, ANALYZE_STEP_LABELS.length - 1)]}
          progressPct={Math.round((state.analyzeStep / 5) * 100)}
        />
      )}

      {state.screen === 'dashboard' && (
        <DashboardScreen
          state={state}
          results={decoratedResults}
          onOpenChat={() => openChat(null)}
          onOpenExampleQuestion={openChat}
          onOpenCountry={openCountry}
          onOpenMapFull={openMapFull}
          onToggleAllRanking={toggleAllRanking}
          onToggleProfileMenu={toggleProfileMenu}
          onEditProfile={editProfile}
          onBackToProfiles={backToProfiles}
        />
      )}

      {state.newProfileOpen && (
        <NewProfileModal
          value={state.newProfileName}
          onChange={onNewProfileNameChange}
          onCancel={cancelNewProfile}
          onConfirm={confirmNewProfile}
        />
      )}

      {state.mapFull && (
        <MapFullModal
          mapReady={state.mapReady}
          worldFeatures={state.worldFeatures}
          results={decoratedResults}
          onClose={closeMapFull}
        />
      )}

      {state.chatOpen && (
        <ChatModal
          messages={state.chatMessages}
          input={state.chatInput}
          onClose={closeChat}
          onInputChange={onChatInputChange}
          onKeyDown={onChatKey}
          onSend={sendChat}
        />
      )}

      {selectedResult && (
        <CountryDetailModal result={selectedResult} onClose={closeCountry} />
      )}
    </div>
  );
}
