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
import type { ExpansionAnalysisProvider } from "../expansion-analysis/types.ts";

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
      { countryCode: "DE", countryName: "Niemcy", score: 82, summary: "Duży, stabilny rynek.", opportunities: ["Silny popyt"], risks: ["Wysoka konkurencja"] },
      { countryCode: "FR", countryName: "Francja", score: 74, summary: "Dobrze rozwinięta gospodarka.", opportunities: ["Dostęp do UE"], risks: ["Bariery językowe"] },
      { countryCode: "US", countryName: "Stany Zjednoczone", score: 65, summary: "Ogromny rynek zbytu.", opportunities: ["Skala rynku"], risks: ["Koszty wejścia"] },
      { countryCode: "GB", countryName: "Wielka Brytania", score: 58, summary: "Ugruntowane relacje handlowe.", opportunities: ["Język angielski"], risks: ["Bariery celne po Brexicie"] },
      { countryCode: "NL", countryName: "Holandia", score: 51, summary: "Dogodna lokalizacja logistyczna.", opportunities: ["Centrum logistyczne UE"], risks: ["Mały rynek wewnętrzny"] },
    ],
  };
}

function fakeExpansionProvider(analysis: ExpansionAnalysis = fakeExpansionAnalysis()): ExpansionAnalysisProvider {
  return { name: "fake-expansion", async analyze() { return analysis; } };
}

function baseDeps(overrides: Partial<CompanyDashboardDeps> = {}): CompanyDashboardDeps {
  return {
    krsProvider: krsProvider(async (krsValue) => (krsValue === companyA.krs ? companyA : null)),
    identificationProvider: identificationProvider([]),
    identificationBudget: createIdentificationBudget({ enabled: true, windowMs: 60000, maxPerWindow: 100, maxConcurrent: 100 }),
    webResearchDeps: fakeWebResearchDeps(),
    expansionAnalysisProvider: fakeExpansionProvider(),
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
  assert.equal(result.expansion.rankedCountries.length, 5);
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
  assert.equal(result.expansion.rankedCountries.length, 5);
});
