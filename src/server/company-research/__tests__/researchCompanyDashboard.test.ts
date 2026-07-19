/**
 * Focused MVP tests for the Dashboard-oriented Company Research flow
 * (`researchCompanyDashboard`): the "completed", "needs_confirmation" and
 * "not_found" outcomes, candidate confirmation, and graceful degradation when
 * an optional paid web-research sub-stage is unavailable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { researchCompanyDashboard } from "../dashboard/researchCompanyDashboard.ts";
import type { CompanyDashboardDeps } from "../dashboard/researchCompanyDashboard.ts";
import { createIdentificationBudget } from "../identification/identificationBudget.ts";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { buildSkippedResult } from "../business-research/buildBusinessResult.ts";
import { DomainDiscoveryDisabledError } from "../domain-discovery/errors.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { fakeKrsExtract } from "./krsFixture.ts";
import type { CompanyDataProvider, KrsCompany } from "../types.ts";
import type {
  CompanyIdentificationProvider,
  DiscoveredCompanyCandidate,
} from "../identification/types.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { CompanyWebResearchDeps } from "../web-research/types.ts";
import type { ExpansionAnalysis } from "../../../contracts/companyDashboard.ts";
import type { ExpansionAnalysisInput, ExpansionAnalysisProvider } from "../expansion-analysis/types.ts";
import type { CompanyEnrichmentFacts, CompanyEnrichmentProvider } from "../enrichment/types.ts";

const RETRIEVED_AT = "2026-07-14T10:00:00.000Z";
const companyA = sanitizeKrsResponse(fakeKrsExtract, "0000123456", RETRIEVED_AT);
const companyB = sanitizeKrsResponse(fakeKrsExtract, "0000654321", RETRIEVED_AT);

function krsProvider(impl: (krs: string) => Promise<KrsCompany | null>): CompanyDataProvider {
  return { name: "fake-krs", fetchByKrs: (krsValue) => impl(krsValue) };
}

function identificationProvider(candidates: DiscoveredCompanyCandidate[]): CompanyIdentificationProvider {
  return { name: "fake-ident", async discoverCandidates() { return { candidates, sources: [] }; } };
}

const NOT_FOUND_DOMAIN: CompanyDomainResolutionResult = {
  status: "not_found",
  confirmedOrigin: null,
  selectedCandidate: null,
  evaluatedCandidates: [],
  confirmation: null,
  reasons: ["NO_DISCOVERY_CANDIDATES"],
  sourceOrigins: [],
};

function fakeWebResearchDeps(overrides: Partial<CompanyWebResearchDeps> = {}): CompanyWebResearchDeps {
  return {
    resolveCompanyDomain: async () => NOT_FOUND_DOMAIN,
    researchCompanyBusiness: async () => buildSkippedResult(),
    // Reuse the REAL assembler — never re-implement its logic in a test double.
    assembleCompanyProfile,
    now: () => new Date(RETRIEVED_AT),
    ...overrides,
  };
}

function fakeExpansionAnalysis(): ExpansionAnalysis {
  return {
    swot: {
      strengths: ["Silna oferta produktowa", "Doświadczony zespół", "Ugruntowana pozycja lokalna"],
      weaknesses: ["Brak obecności międzynarodowej", "Ograniczone zasoby", "Niska rozpoznawalność marki"],
      opportunities: ["Rosnący popyt regionalny", "Cyfryzacja sprzedaży", "Nowe kanały dystrybucji"],
      threats: ["Konkurencja globalna", "Zmienność kursów walut", "Zmiany regulacyjne"],
    },
    rankedCountries: [
      { countryCode: "DE", countryName: "Niemcy", score: 88, summary: "Duży, stabilny rynek.", opportunities: ["Silny popyt"], risks: ["Wysoka konkurencja"] },
      { countryCode: "FR", countryName: "Francja", score: 84, summary: "Dobrze rozwinięta gospodarka.", opportunities: ["Dostęp do UE"], risks: ["Bariery językowe"] },
      { countryCode: "US", countryName: "Stany Zjednoczone", score: 80, summary: "Ogromny rynek zbytu.", opportunities: ["Skala rynku"], risks: ["Koszty wejścia"] },
      { countryCode: "GB", countryName: "Wielka Brytania", score: 76, summary: "Ugruntowane relacje handlowe.", opportunities: ["Język angielski"], risks: ["Bariery celne po Brexicie"] },
      { countryCode: "NL", countryName: "Holandia", score: 72, summary: "Dogodna lokalizacja logistyczna.", opportunities: ["Centrum logistyczne UE"], risks: ["Mały rynek wewnętrzny"] },
      { countryCode: "PL", countryName: "Polska", score: 68, summary: "Rynek macierzysty jako baza.", opportunities: ["Znajomość rynku"], risks: ["Ograniczona skala"] },
      { countryCode: "BR", countryName: "Brazylia", score: 64, summary: "Duży rynek Ameryki Południowej.", opportunities: ["Rosnąca klasa średnia"], risks: ["Bariery celne"] },
      { countryCode: "ES", countryName: "Hiszpania", score: 60, summary: "Dostęp do rynków iberyjskich.", opportunities: ["Bliskość kulturowa"], risks: ["Wolniejszy wzrost gospodarczy"] },
      { countryCode: "IT", countryName: "Włochy", score: 56, summary: "Trzecia gospodarka strefy euro.", opportunities: ["Silny przemysł"], risks: ["Biurokracja"] },
      { countryCode: "SE", countryName: "Szwecja", score: 52, summary: "Innowacyjny rynek skandynawski.", opportunities: ["Wysoka siła nabywcza"], risks: ["Mały rynek wewnętrzny"] },
      { countryCode: "CZ", countryName: "Czechy", score: 48, summary: "Bliski rynek regionalny.", opportunities: ["Krótkie łańcuchy dostaw"], risks: ["Ograniczona wielkość rynku"] },
      { countryCode: "AT", countryName: "Austria", score: 44, summary: "Stabilna gospodarka niemieckojęzyczna.", opportunities: ["Wysoka jakość życia"], risks: ["Wysokie koszty pracy"] },
      { countryCode: "CH", countryName: "Szwajcaria", score: 40, summary: "Zamożny, wymagający rynek.", opportunities: ["Wysokie marże"], risks: ["Wysokie koszty wejścia"] },
      { countryCode: "CA", countryName: "Kanada", score: 36, summary: "Stabilny rynek północnoamerykański.", opportunities: ["Otwartość na import"], risks: ["Duża odległość logistyczna"] },
      { countryCode: "JP", countryName: "Japonia", score: 32, summary: "Wymagający, dojrzały rynek azjatycki.", opportunities: ["Wysoka jakość oczekiwana"], risks: ["Bariery kulturowe i językowe"] },
    ],
  };
}

function fakeExpansionProvider(
  analysis: ExpansionAnalysis = fakeExpansionAnalysis(),
  onAnalyze?: (input: ExpansionAnalysisInput) => void,
): ExpansionAnalysisProvider {
  return {
    name: "fake-expansion",
    async analyze(input) {
      onAnalyze?.(input);
      return analysis;
    },
  };
}

/** By default the fallback is "unavailable" (throws) — existing tests keep a legal-only profile. */
function fakeEnrichmentProvider(facts: CompanyEnrichmentFacts | null = null): CompanyEnrichmentProvider {
  return {
    name: "fake-enrichment",
    async enrich() {
      if (facts === null) throw new Error("enrichment unavailable");
      return facts;
    },
  };
}

function fullEnrichmentFacts(overrides: Partial<CompanyEnrichmentFacts> = {}): CompanyEnrichmentFacts {
  return {
    description: "Firma dostarcza oprogramowanie dla sektora finansowego.",
    industry: "Oprogramowanie finansowe",
    foundedYear: 2005,
    website: "https://przyklad.example",
    productsServices: ["Platforma płatnicza"],
    customerSegments: ["Banki"],
    operatingMarkets: ["Polska", "Niemcy"],
    ...overrides,
  };
}

function baseDeps(overrides: Partial<CompanyDashboardDeps> = {}): CompanyDashboardDeps {
  return {
    krsProvider: krsProvider(async (krsValue) => (krsValue === companyA.krs ? companyA : null)),
    identificationProvider: identificationProvider([]),
    identificationBudget: createIdentificationBudget({ enabled: true, windowMs: 60000, maxPerWindow: 100, maxConcurrent: 100 }),
    webResearchDeps: fakeWebResearchDeps(),
    expansionAnalysisProvider: fakeExpansionProvider(),
    enrichmentProvider: fakeEnrichmentProvider(null),
    ...overrides,
  };
}

function ctx() {
  return { requestId: "req_1" };
}

test("(dashboard completed) exact KRS flow returns the dashboard-shaped completed response", async () => {
  const result = await researchCompanyDashboard(
    { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
    baseDeps(),
    ctx(),
  );
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.company.legalName, companyA.legalName);
  assert.equal(result.company.krs, companyA.krs);
  assert.ok(result.sources.some((s) => s.provider === "krs"));
  assert.equal(result.expansion.rankedCountries.length, 15);
  assert.deepEqual(Object.keys(result.expansion.swot).sort(), ["opportunities", "strengths", "threats", "weaknesses"]);
});

test("(dashboard not_found) unknown KRS returns not_found", async () => {
  const deps = baseDeps({ krsProvider: krsProvider(async () => null) });
  const result = await researchCompanyDashboard(
    { query: { name: "Nieznana Firma", countryCode: "PL", krs: "0000000000" } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "not_found");
});

test("(dashboard needs_confirmation) multiple verified name-search candidates surface for confirmation", async () => {
  const candidates: DiscoveredCompanyCandidate[] = [
    { legalName: companyA.legalName, krs: companyA.krs, countryCode: "PL" },
    { legalName: companyB.legalName, krs: companyB.krs, countryCode: "PL" },
  ];
  const deps = baseDeps({
    krsProvider: krsProvider(async (krsValue) => {
      if (krsValue === companyA.krs) return companyA;
      if (krsValue === companyB.krs) return companyB;
      return null;
    }),
    identificationProvider: identificationProvider(candidates),
  });
  const result = await researchCompanyDashboard(
    { query: { name: companyA.legalName, countryCode: "PL" } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "needs_confirmation");
  if (result.status !== "needs_confirmation") return;
  assert.equal(result.candidates.length, 2);

  // Candidate confirmation: selecting one of the returned candidateIds must
  // resolve to a completed dashboard for that exact company.
  const chosen = result.candidates[0];
  const confirmed = await researchCompanyDashboard(
    { query: { name: companyA.legalName, countryCode: "PL" }, selectedCandidateId: chosen.candidateId },
    deps,
    ctx(),
  );
  assert.equal(confirmed.status, "completed");
  if (confirmed.status !== "completed") return;
  assert.equal(confirmed.company.krs, chosen.identifiers.krs);
});

test("(dashboard degradation) a disabled web-research sub-stage still yields a completed, legal-only dashboard", async () => {
  const deps = baseDeps({
    webResearchDeps: fakeWebResearchDeps({
      resolveCompanyDomain: async () => {
        throw new DomainDiscoveryDisabledError();
      },
    }),
  });
  const result = await researchCompanyDashboard(
    { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.company.website, undefined);
  assert.equal(result.expansion.rankedCountries.length, 15);
});

test("(dashboard enrichment) a legal-only profile is enriched by the fallback provider", async () => {
  const deps = baseDeps({
    enrichmentProvider: fakeEnrichmentProvider(fullEnrichmentFacts()),
  });
  const result = await researchCompanyDashboard(
    { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.company.description, "Firma dostarcza oprogramowanie dla sektora finansowego.");
  assert.equal(result.company.industry, "Oprogramowanie finansowe");
  assert.equal(result.company.foundedYear, 2005);
  assert.equal(result.company.website, "https://przyklad.example");
  assert.deepEqual(result.company.productsServices, ["Platforma płatnicza"]);
  assert.deepEqual(result.company.customerSegments, ["Banki"]);
  assert.deepEqual(result.company.operatingMarkets, ["Polska", "Niemcy"]);
  // Legal identifiers are still KRS-authoritative — never touched by enrichment.
  assert.equal(result.company.krs, companyA.krs);
});

// (localization) MarketCompass MVP: a representative Polish-language enriched
// profile must reach the dashboard response completely unchanged — the
// backend generates Polish text; the dashboard mapping never translates,
// rewrites or reformats it.
test("(localization) a Polish-language enrichment result passes through the dashboard response unchanged", async () => {
  const polishFacts: CompanyEnrichmentFacts = {
    description:
      "Polska grupa działająca w branży gier komputerowych, zajmująca się produkcją, wydawaniem i dystrybucją gier.",
    industry: "Gry komputerowe i rozrywka cyfrowa",
    foundedYear: 1994,
    website: "https://www.cdprojekt.com",
    productsServices: [
      "Produkcja i wydawanie gier komputerowych",
      "Zarządzanie markami Wiedźmin i Cyberpunk",
      "Cyfrowa dystrybucja gier",
    ],
    customerSegments: ["Graczy na całym świecie"],
    operatingMarkets: ["Polska", "Europa", "Ameryka Północna"],
  };
  const deps = baseDeps({ enrichmentProvider: fakeEnrichmentProvider(polishFacts) });
  const result = await researchCompanyDashboard(
    { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.company.description, polishFacts.description);
  assert.equal(result.company.industry, polishFacts.industry);
  assert.deepEqual(result.company.productsServices, polishFacts.productsServices);
  assert.deepEqual(result.company.customerSegments, polishFacts.customerSegments);
  assert.deepEqual(result.company.operatingMarkets, polishFacts.operatingMarkets);
});

test("(dashboard enrichment) a failing fallback provider gracefully keeps the legal-only profile", async () => {
  const deps = baseDeps({ enrichmentProvider: fakeEnrichmentProvider(null) });
  const result = await researchCompanyDashboard(
    { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "completed");
  if (result.status !== "completed") return;
  assert.equal(result.company.description, undefined);
  assert.equal(result.company.website, undefined);
  assert.deepEqual(result.company.productsServices, []);
});

test("(dashboard enrichment) the expansion analysis receives the enriched profile", async () => {
  let capturedInput: ExpansionAnalysisInput | null = null;
  const deps = baseDeps({
    enrichmentProvider: fakeEnrichmentProvider(fullEnrichmentFacts()),
    expansionAnalysisProvider: fakeExpansionProvider(fakeExpansionAnalysis(), (input) => {
      capturedInput = input;
    }),
  });
  const result = await researchCompanyDashboard(
    { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
    deps,
    ctx(),
  );
  assert.equal(result.status, "completed");
  assert.ok(capturedInput !== null);
  const input: ExpansionAnalysisInput = capturedInput!;
  assert.equal(input.industry, "Oprogramowanie finansowe");
  assert.equal(input.description, "Firma dostarcza oprogramowanie dla sektora finansowego.");
  assert.deepEqual(input.productsServices, ["Platforma płatnicza"]);
  assert.deepEqual(input.customerSegments, ["Banki"]);
  assert.deepEqual(input.operatingMarkets, ["Polska", "Niemcy"]);
});

// A required-stage failure — must never be hidden as a graceful fallback,
// unlike the optional enrichment stage.
test("(required stages) an expansion-analysis failure still propagates, it is never hidden", async () => {
  const deps = baseDeps({
    expansionAnalysisProvider: {
      name: "fake-expansion-failing",
      async analyze() {
        throw new Error("expansion analysis provider unavailable");
      },
    },
  });
  await assert.rejects(() =>
    researchCompanyDashboard(
      { query: { name: "Przykładowa Spółka", countryCode: "PL", krs: companyA.krs } },
      deps,
      ctx(),
    ),
  );
});
