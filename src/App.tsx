"use client";

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { researchCompany, CompanyResearchClientError } from './lib/company-research/client';
import { loadDashboard, saveDashboard, clearDashboard } from './lib/dashboardStorage';
import { decorateCountry, buildChatCompanyContext } from './lib/derive';
import {
  ChatClientError,
  isAbortError,
  prepareRequestHistory,
  streamChat,
  MAX_MESSAGE_CHARS,
} from './lib/ai/chatClient';
import type { ChatRequestMessage } from './lib/ai/chatClient';
import type { AppState, ChatMessage, FormValues } from './types';
import { emptyFormValues } from './types';
import CompanyFormScreen from './screens/CompanyFormScreen';
import ConfirmCandidateScreen from './screens/ConfirmCandidateScreen';
import AnalyzingScreen from './screens/AnalyzingScreen';
import DashboardScreen from './screens/DashboardScreen';
import MapFullModal from './components/MapFullModal';
import ChatModal from './components/ChatModal';
import CountryDetailModal from './components/CountryDetailModal';

const initialState: AppState = {
  screen: 'form',
  form: emptyFormValues(),
  formError: null,
  apiError: null,
  candidates: [],
  dashboard: null,
  selectedCountryCode: null,
  showAllRanking: false,
  mapFull: false,
  mapReady: false,
  worldFeatures: [],
  chatOpen: false,
  chatMessages: [],
  chatInput: '',
  chatGenerating: false,
  chatError: null,
};

const CHAT_GREETING =
  'Cześć! Jestem asystentem MarketCompass. Zapytaj mnie o dowolny rynek, ryzyko, strategię ekspansji lub o Twoją firmę.\n';
const CHAT_GENERIC_ERROR =
  'Nie udało się uzyskać odpowiedzi MarketCompassAI. Spróbuj ponownie.';
const GENERIC_RESEARCH_ERROR = 'Nie udało się wykonać researchu firmy. Spróbuj ponownie.';

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
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

  // Client-only: restore the last completed dashboard, if any.
  useEffect(() => {
    const dashboard = loadDashboard();
    if (dashboard) patch({ dashboard, screen: 'dashboard' });
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

  const updateField = (field: keyof FormValues, value: string) =>
    patch((s) => ({ form: { ...s.form, [field]: value }, formError: null }));

  function parsedFoundedYear(): number | undefined {
    const raw = stateRef.current.form.foundedYear.trim();
    if (!raw) return undefined;
    const year = Number(raw);
    return Number.isInteger(year) ? year : undefined;
  }

  async function runResearch(selectedCandidateId?: string) {
    const controller = new AbortController();
    researchAbortRef.current = controller;
    patch({ screen: 'loading', apiError: null });

    try {
      const result = await researchCompany(
        {
          query: {
            name: stateRef.current.form.name.trim(),
            foundedYear: parsedFoundedYear(),
            krs: stateRef.current.form.krs.trim() || undefined,
          },
          selectedCandidateId,
        },
        controller.signal,
      );

      if (result.status === 'completed') {
        saveDashboard(result);
        patch({ screen: 'dashboard', dashboard: result, candidates: [], apiError: null });
        return;
      }
      if (result.status === 'needs_confirmation') {
        patch({ screen: 'confirm', candidates: result.candidates, apiError: null });
        return;
      }
      // not_found
      patch({ screen: 'form', apiError: result.message, candidates: [] });
    } catch (error) {
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
    runResearch();
  }

  function selectCandidate(candidateId: string) {
    runResearch(candidateId);
  }

  function backToForm() {
    researchAbortRef.current?.abort();
    patch({ screen: 'form', candidates: [], apiError: null });
  }

  function startNewAnalysis() {
    clearDashboard();
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

  // ---- dashboard: map + ranking ----
  const selectCountry = (countryCode: string) => patch({ selectedCountryCode: countryCode });
  const closeCountry = () => patch({ selectedCountryCode: null });
  const openMapFull = (e?: React.MouseEvent) => { if (e) e.preventDefault(); patch({ mapFull: true }); };
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
      await streamChat(
        requestHistory,
        {
          onTextDelta: (delta) => {
            if (chatGenRef.current === genId) appendAssistantDelta(delta);
          },
        },
        controller.signal,
        companyContext,
      );
      if (chatGenRef.current === genId) patch({ chatGenerating: false });
    } catch (err) {
      if (chatGenRef.current !== genId) return;
      if (isAbortError(err)) {
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

      {state.screen === 'dashboard' && state.dashboard && (
        <DashboardScreen
          dashboard={state.dashboard}
          countries={decoratedCountries}
          worldFeatures={state.worldFeatures}
          mapReady={state.mapReady}
          onOpenChat={() => openChat(null)}
          onOpenExampleQuestion={openChat}
          onSelectCountry={selectCountry}
          onOpenMapFull={openMapFull}
          onNewAnalysis={startNewAnalysis}
        />
      )}

      {state.mapFull && (
        <MapFullModal
          mapReady={state.mapReady}
          worldFeatures={state.worldFeatures}
          countries={decoratedCountries}
          onSelectCountry={selectCountry}
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

      {selectedCountry && (
        <CountryDetailModal country={selectedCountry} onClose={closeCountry} />
      )}
    </div>
  );
}
