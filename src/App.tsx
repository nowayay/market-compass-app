"use client";

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
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
import {
  ChatClientError,
  isAbortError,
  prepareRequestHistory,
  streamChat,
  MAX_MESSAGE_CHARS,
} from './lib/ai/chatClient';
import type { ChatRequestMessage } from './lib/ai/chatClient';
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
  chatGenerating: false,
  chatError: null,
};

const CHAT_GREETING =
  'Cześć! Jestem asystentem MarketCompass. Zapytaj mnie o dowolny rynek, ryzyko, strategię ekspansji lub o informacje na temat danego przedsiębiorstwa.\n';
const CHAT_GENERIC_ERROR =
  'Nie udało się uzyskać odpowiedzi MarketCompassAI. Spróbuj ponownie.';

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // AbortController for the in-flight chat generation, if any. Kept in a ref so
  // it survives re-renders and doubles as the "a generation is active" guard.
  const chatAbortRef = useRef<AbortController | null>(null);
  // Monotonic identity of the active generation. A generation only mutates chat
  // state while its id still matches; closing/superseding a request bumps this
  // so late deltas or errors from an obsolete request are ignored.
  const chatGenRef = useRef(0);

  const patch = (updates: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
    setState((s) => ({ ...s, ...(typeof updates === 'function' ? updates(s) : updates) }));

  // Abort any active chat request when the app unmounts.
  useEffect(() => () => chatAbortRef.current?.abort(), []);

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

  // Append a streamed delta to the current (last) assistant placeholder,
  // leaving every earlier message untouched.
  function appendAssistantDelta(delta: string) {
    setState((s) => {
      const msgs = s.chatMessages.slice();
      const last = msgs[msgs.length - 1];
      if (last && last.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, text: last.text + delta };
      }
      return { ...s, chatMessages: msgs };
    });
  }

  // Drop a trailing assistant placeholder that never received any text.
  function dropEmptyPlaceholder(msgs: ChatMessage[]): ChatMessage[] {
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && last.text.length === 0) {
      return msgs.slice(0, -1);
    }
    return msgs;
  }

  // Core send path shared by manual input and example questions. `baseMessages`
  // is the conversation to build on, passed explicitly to avoid reading stale
  // state right after opening the modal.
  async function startGeneration(rawQuestion: string, baseMessages: ChatMessage[]) {
    const question = rawQuestion.trim();
    if (!question || question.length > MAX_MESSAGE_CHARS) return;
    if (chatAbortRef.current) return; // a generation is already running

    const requestHistory: ChatRequestMessage[] = prepareRequestHistory(
      baseMessages.map((m) => ({ role: m.role, content: m.text })),
      question,
    );

    const controller = new AbortController();
    const genId = ++chatGenRef.current;
    chatAbortRef.current = controller;

    patch({
      chatOpen: true,
      chatMessages: [
        ...baseMessages,
        { role: 'user', text: question },
        { role: 'assistant', text: '' },
      ],
      chatInput: '',
      chatGenerating: true,
      chatError: null,
    });

    try {
      await streamChat(
        requestHistory,
        {
          onTextDelta: (delta) => {
            // Ignore deltas from a superseded/closed generation.
            if (chatGenRef.current === genId) appendAssistantDelta(delta);
          },
        },
        controller.signal,
      );
      if (chatGenRef.current === genId) patch({ chatGenerating: false });
    } catch (err) {
      // An obsolete generation must not touch chat state that now belongs to a
      // newer generation (or a freshly reopened chat).
      if (chatGenRef.current !== genId) return;
      if (isAbortError(err)) {
        // User-initiated stop: keep any streamed text, drop an empty bubble,
        // and show no error.
        setState((s) => ({
          ...s,
          chatMessages: dropEmptyPlaceholder(s.chatMessages),
          chatGenerating: false,
        }));
      } else {
        const message = err instanceof ChatClientError ? err.message : CHAT_GENERIC_ERROR;
        setState((s) => ({
          ...s,
          chatMessages: dropEmptyPlaceholder(s.chatMessages),
          chatGenerating: false,
          chatError: message,
        }));
      }
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
    }
  }

  function openChat(question: string | null) {
    // Reuse the current session conversation; only seed the greeting when the
    // chat is empty so closing and reopening preserves history.
    const existing = stateRef.current.chatMessages;
    const base: ChatMessage[] =
      existing.length > 0 ? existing : [{ role: 'assistant', text: CHAT_GREETING }];
    if (question) {
      startGeneration(question, base);
    } else {
      patch({ chatOpen: true, chatMessages: base, chatInput: '', chatError: null });
    }
  }
  function closeChat() {
    // Abort and invalidate the active generation so late deltas/errors cannot
    // mutate the conversation after (or when) the chat is reopened. Preserve any
    // streamed text and drop a still-empty placeholder.
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    chatGenRef.current++;
    setState((s) => ({
      ...s,
      chatOpen: false,
      chatGenerating: false,
      chatError: null,
      chatMessages: dropEmptyPlaceholder(s.chatMessages),
    }));
  }
  const onChatInputChange = (e: ChangeEvent<HTMLInputElement>) => patch({ chatInput: e.target.value });
  function sendChat() {
    startGeneration(stateRef.current.chatInput, stateRef.current.chatMessages);
  }
  function stopChat() {
    chatAbortRef.current?.abort();
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
          isGenerating={state.chatGenerating}
          error={state.chatError}
          onClose={closeChat}
          onInputChange={onChatInputChange}
          onSend={sendChat}
          onStop={stopChat}
        />
      )}

      {selectedResult && (
        <CountryDetailModal result={selectedResult} onClose={closeCountry} />
      )}
    </div>
  );
}
