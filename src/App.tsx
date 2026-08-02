"use client";

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { researchCompany, CompanyResearchClientError } from './lib/company-research/client';
import { loadProfiles, profileKeyOf, removeProfile, saveProfiles, upsertProfile } from './lib/profileStorage';
import { decorateCountry, buildChatCompanyContext } from './lib/derive';
import {
  ChatClientError,
  isAbortError,
  prepareRequestHistory,
  streamChat,
  MAX_MESSAGE_CHARS,
} from './lib/ai/chatClient';
import type { ChatRequestMessage } from './lib/ai/chatClient';
import type { AppState, ChatMessage, FormValues, SearchQuery } from './types';
import { emptyFormValues } from './types';
import CompanyFormScreen from './screens/CompanyFormScreen';
import ConfirmCandidateScreen from './screens/ConfirmCandidateScreen';
import AnalyzingScreen from './screens/AnalyzingScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProfilesScreen from './screens/ProfilesScreen';
import MapFullModal from './components/MapFullModal';
import ChatModal from './components/ChatModal';
import CountryDetailModal from './components/CountryDetailModal';

const initialState: AppState = {
  screen: 'form',
  form: emptyFormValues(),
  formError: null,
  apiError: null,
  searchQuery: null,
  candidates: [],
  dashboard: null,
  selectedCountryCode: null,
  showAllRanking: false,
  mapFull: false,
  mapStatus: 'loading',
  worldFeatures: [],
  chatOpen: false,
  chatMessages: [],
  chatInput: '',
  chatGenerating: false,
  chatError: null,
  profiles: [],
  profileMenuOpenId: null,
  profileToDeleteId: null,
};

const CHAT_GREETING =
  'Cześć! Jestem asystentem MarketCompass. Zapytaj mnie o dowolny rynek, ryzyko, strategię ekspansji lub o Twoją firmę.\n';
const CHAT_GENERIC_ERROR =
  'Nie udało się uzyskać odpowiedzi MarketCompassAI. Spróbuj ponownie.';
const GENERIC_RESEARCH_ERROR = 'Nie udało się wykonać researchu firmy. Spróbuj ponownie.';
// Client-side ceiling for the whole research request. Kept just under the
// route's serverless maxDuration (300s) so the browser gives up slightly after
// the server would, surfacing a clear message instead of a hung spinner.
const RESEARCH_REQUEST_TIMEOUT_MS = 290_000;
const RESEARCH_TIMEOUT_ERROR =
  'Analiza trwała zbyt długo i została przerwana. Spróbuj ponownie za chwilę.';

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  // Bumped by the map's retry button to re-run the world-atlas fetch.
  const [mapAttempt, setMapAttempt] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const chatAbortRef = useRef<AbortController | null>(null);
  const chatGenRef = useRef(0);
  const researchAbortRef = useRef<AbortController | null>(null);

  const patch = (updates: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
    setState((s) => ({ ...s, ...(typeof updates === 'function' ? updates(s) : updates) }));

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      researchAbortRef.current?.abort();
    };
  }, []);

  // Client-only: restore saved company profiles (migrating the legacy
  // single-dashboard slot on first read, if needed). With at least one saved
  // profile, land on the profile picker instead of the search form.
  useEffect(() => {
    const profiles = loadProfiles();
    patch(profiles.length > 0 ? { profiles, screen: 'profiles' } : { profiles });
  }, []);

  // The world outlines come from a third-party CDN, so a failed or slow network
  // is an expected state rather than an exception. A failure surfaces a retry
  // instead of an endless "loading" — bumping `mapAttempt` re-runs this effect.
  useEffect(() => {
    let cancelled = false;
    patch({ mapStatus: 'loading' });
    (async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json');
        if (!res.ok) throw new Error(`world atlas responded ${res.status}`);
        const geo = await res.json() as FeatureCollection;
        const width = 960, height = 470;
        const projection = geoNaturalEarth1().fitSize([width, height], geo);
        const pathGen = geoPath(projection);
        const worldFeatures = geo.features
          .map((f) => ({ iso3: String(f.id ?? ''), d: pathGen(f) ?? '' }))
          .filter((f) => f.d);
        if (worldFeatures.length === 0) throw new Error('world atlas contained no usable outlines');
        if (!cancelled) patch({ worldFeatures, mapStatus: 'ready' });
      } catch {
        if (!cancelled) patch({ worldFeatures: [], mapStatus: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [mapAttempt]);

  const retryMap = () => setMapAttempt((a) => a + 1);

  const updateField = (field: keyof FormValues, value: string) =>
    patch((s) => ({ form: { ...s.form, [field]: value }, formError: null }));

  function parsedFoundedYear(): number | undefined {
    const raw = stateRef.current.form.foundedYear.trim();
    if (!raw) return undefined;
    const year = Number(raw);
    return Number.isInteger(year) ? year : undefined;
  }

  function buildSearchQuery(): SearchQuery {
    return {
      name: stateRef.current.form.name.trim(),
      foundedYear: parsedFoundedYear(),
      krs: stateRef.current.form.krs.trim() || undefined,
    };
  }

  // `query` is always the ORIGINAL search input (frozen at submit time, see
  // `submitForm`/`selectCandidate`) — a candidate confirmation reuses it
  // verbatim rather than re-reading `state.form`, which may no longer be what
  // was actually searched. Guards against a double-click / overlapping
  // request: a second call while one is already in flight is a no-op.
  async function runResearch(query: SearchQuery, selectedCandidateId?: string) {
    if (researchAbortRef.current) return;
    const controller = new AbortController();
    researchAbortRef.current = controller;
    // Combine the user-cancellation controller with a hard request timeout, so
    // a stuck request is abandoned client-side rather than spinning forever.
    // The two aborts are told apart below via each signal's `.aborted` flag.
    const timeoutSignal = AbortSignal.timeout(RESEARCH_REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([controller.signal, timeoutSignal]);
    patch({ screen: 'loading', apiError: null });

    try {
      const result = await researchCompany({ query, selectedCandidateId }, signal);

      if (result.status === 'completed') {
        // Adds a new profile, or updates the existing one for this company's
        // KRS in place — earlier profiles are never removed by this.
        const profiles = upsertProfile(stateRef.current.profiles, result, new Date().toISOString());
        saveProfiles(profiles);
        patch({ screen: 'dashboard', dashboard: result, candidates: [], apiError: null, profiles });
        return;
      }
      if (result.status === 'needs_confirmation') {
        patch({ screen: 'confirm', candidates: result.candidates, apiError: null });
        return;
      }
      // not_found
      patch({ screen: 'form', apiError: result.message, candidates: [] });
    } catch (error) {
      // A user-initiated cancellation (backToForm / overlapping submit) stays
      // silent; only the request timeout surfaces its own message.
      if (controller.signal.aborted) return;
      if (timeoutSignal.aborted) {
        patch({
          screen: stateRef.current.candidates.length > 0 ? 'confirm' : 'form',
          apiError: RESEARCH_TIMEOUT_ERROR,
        });
        return;
      }
      if (isAbortError(error)) return;
      const message = error instanceof CompanyResearchClientError ? error.message : GENERIC_RESEARCH_ERROR;
      patch({ screen: stateRef.current.candidates.length > 0 ? 'confirm' : 'form', apiError: message });
    } finally {
      if (researchAbortRef.current === controller) researchAbortRef.current = null;
    }
  }

  function submitForm() {
    if (!stateRef.current.form.name.trim()) {
      patch({ formError: 'Podaj nazwę firmy, aby rozpocząć wyszukiwanie.' });
      return;
    }
    const query = buildSearchQuery();
    patch({ searchQuery: query });
    runResearch(query);
  }

  // Reuses the exact query that produced the currently shown candidate list —
  // never re-derived from (and never compared against) the live form state.
  function selectCandidate(candidateId: string) {
    const query = stateRef.current.searchQuery;
    if (!query) return;
    runResearch(query, candidateId);
  }

  function backToForm() {
    researchAbortRef.current?.abort();
    researchAbortRef.current = null;
    patch({ screen: 'form', candidates: [], apiError: null });
  }

  // Goes to the search form for a new company. Earlier saved profiles are
  // never touched — they stay in localStorage and in `state.profiles`.
  function startNewAnalysis() {
    patch({
      screen: 'form',
      form: emptyFormValues(),
      formError: null,
      apiError: null,
      candidates: [],
      dashboard: null,
      selectedCountryCode: null,
    });
  }

  // ---- company profiles ----
  function openProfiles() {
    patch({ screen: 'profiles' });
  }

  function selectProfile(id: string) {
    const entry = stateRef.current.profiles.find((p) => p.id === id);
    if (!entry) return;
    patch({ screen: 'dashboard', dashboard: entry.dashboard, selectedCountryCode: null });
  }

  function toggleProfileMenu(id: string) {
    patch((s) => ({ profileMenuOpenId: s.profileMenuOpenId === id ? null : id }));
  }

  function closeProfileMenu() {
    patch({ profileMenuOpenId: null });
  }

  function requestDeleteProfile(id: string) {
    patch({ profileMenuOpenId: null, profileToDeleteId: id });
  }

  function cancelDeleteProfile() {
    patch({ profileToDeleteId: null });
  }

  function confirmDeleteProfile() {
    const id = stateRef.current.profileToDeleteId;
    if (!id) return;
    const profiles = removeProfile(stateRef.current.profiles, id);
    saveProfiles(profiles);
    patch((s) => ({
      profiles,
      profileToDeleteId: null,
      // Never leave the currently open dashboard pointing at a deleted profile.
      dashboard: s.dashboard && profileKeyOf(s.dashboard) === id ? null : s.dashboard,
    }));
  }

  // ---- dashboard: map + ranking ----
  const selectCountry = (countryCode: string) => patch({ selectedCountryCode: countryCode });
  const closeCountry = () => patch({ selectedCountryCode: null });
  const openMapFull = () => patch({ mapFull: true });
  const closeMapFull = () => patch({ mapFull: false });

  // ---- chat ----
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

  function dropEmptyPlaceholder(msgs: ChatMessage[]): ChatMessage[] {
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && last.text.length === 0) {
      return msgs.slice(0, -1);
    }
    return msgs;
  }

  /** True when the last message is an assistant reply that already has content. */
  function lastAssistantHasText(msgs: ChatMessage[]): boolean {
    const last = msgs[msgs.length - 1];
    return !!last && last.role === 'assistant' && last.text.trim().length > 0;
  }

  /** Flags the last assistant reply as truncated, so the UI shows the neutral note. */
  function markLastAssistantTruncated(msgs: ChatMessage[]): ChatMessage[] {
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant' && last.text.trim().length > 0) {
      const copy = msgs.slice();
      copy[copy.length - 1] = { ...last, truncated: true };
      return copy;
    }
    return msgs;
  }

  async function startGeneration(rawQuestion: string, baseMessages: ChatMessage[]) {
    const question = rawQuestion.trim();
    if (!question || question.length > MAX_MESSAGE_CHARS) return;
    if (chatAbortRef.current) return;

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

    const companyContext = stateRef.current.dashboard
      ? buildChatCompanyContext(stateRef.current.dashboard)
      : undefined;

    try {
      const status = await streamChat(
        requestHistory,
        {
          onTextDelta: (delta) => {
            if (chatGenRef.current === genId) appendAssistantDelta(delta);
          },
        },
        controller.signal,
        companyContext,
      );
      if (chatGenRef.current !== genId) return;
      // A truncated reply keeps its partial text; only add the neutral note.
      setState((s) => ({
        ...s,
        chatMessages: status === 'truncated' ? markLastAssistantTruncated(s.chatMessages) : s.chatMessages,
        chatGenerating: false,
      }));
    } catch (err) {
      if (chatGenRef.current !== genId) return;
      // Whether it was an abort or a stream error: if useful text already
      // arrived, keep it and show the neutral "shortened" note instead of a red
      // error. Only a truly empty reply surfaces the full error.
      setState((s) => {
        if (lastAssistantHasText(s.chatMessages)) {
          return { ...s, chatMessages: markLastAssistantTruncated(s.chatMessages), chatGenerating: false };
        }
        const base = { ...s, chatMessages: dropEmptyPlaceholder(s.chatMessages), chatGenerating: false };
        if (isAbortError(err)) return base;
        return { ...base, chatError: err instanceof ChatClientError ? err.message : CHAT_GENERIC_ERROR };
      });
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
    }
  }

  function openChat(question: string | null) {
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

  const decoratedCountries = state.dashboard
    ? state.dashboard.expansion.rankedCountries.map(decorateCountry)
    : [];
  const selectedCountry = decoratedCountries.find((c) => c.countryCode === state.selectedCountryCode) || null;

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#FAF8F4', color: '#1F2937', position: 'relative', overflowX: 'hidden' }}>
      {state.screen === 'form' && (
        <CompanyFormScreen
          form={state.form}
          formError={state.formError}
          apiError={state.apiError}
          onFieldChange={updateField}
          onSubmitForm={submitForm}
        />
      )}

      {state.screen === 'confirm' && (
        <ConfirmCandidateScreen
          candidates={state.candidates}
          apiError={state.apiError}
          onSelectCandidate={selectCandidate}
          onBack={backToForm}
        />
      )}

      {state.screen === 'loading' && <AnalyzingScreen />}

      {state.screen === 'profiles' && (
        <ProfilesScreen
          profiles={state.profiles}
          openMenuId={state.profileMenuOpenId}
          deleteTargetId={state.profileToDeleteId}
          onSelectProfile={selectProfile}
          onNewProfile={startNewAnalysis}
          onToggleMenu={toggleProfileMenu}
          onCloseMenu={closeProfileMenu}
          onRequestDelete={requestDeleteProfile}
          onCancelDelete={cancelDeleteProfile}
          onConfirmDelete={confirmDeleteProfile}
        />
      )}

      {state.screen === 'dashboard' && state.dashboard && (
        <DashboardScreen
          dashboard={state.dashboard}
          countries={decoratedCountries}
          worldFeatures={state.worldFeatures}
          mapStatus={state.mapStatus}
          onRetryMap={retryMap}
          onOpenChat={() => openChat(null)}
          onOpenExampleQuestion={openChat}
          onSelectCountry={selectCountry}
          onOpenMapFull={openMapFull}
          onNewAnalysis={startNewAnalysis}
          onBackToProfiles={openProfiles}
        />
      )}

      {state.mapFull && (
        <MapFullModal
          mapStatus={state.mapStatus}
          worldFeatures={state.worldFeatures}
          countries={decoratedCountries}
          onSelectCountry={selectCountry}
          onRetryMap={retryMap}
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

      {selectedCountry && state.dashboard && (
        <CountryDetailModal
          key={selectedCountry.countryCode}
          country={selectedCountry}
          company={state.dashboard.company}
          onClose={closeCountry}
        />
      )}
    </div>
  );
}
