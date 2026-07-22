/**
 * Focused MVP tests for the Company Profile Enrichment fallback
 * (`enrichCompanyProfile` / `mergeEnrichmentFacts` / `needsEnrichment`): the
 * optional, best-effort OpenAI web-search step that fills in business facts
 * for a legal-only (or otherwise business-data-empty) assembled profile.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enrichCompanyProfile,
  mergeEnrichmentFacts,
  needsEnrichment,
} from "../enrichment/enrichCompanyProfile.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import {
  clock,
  completedBusiness,
  confirmedResolution,
  krsCompany,
  notFoundResolution,
  skippedBusiness,
} from "./profileAssemblyFixtures.ts";
import type { CompanyProfile } from "../../../contracts/companyResearch.ts";
import type { CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";
import type { CompanyEnrichmentFacts, CompanyEnrichmentProvider } from "../enrichment/types.ts";

function legalOnlyAssembly(): CompanyProfileAssemblyResult {
  return assembleCompanyProfile(
    { company: krsCompany(), domainResolution: notFoundResolution(), businessResearch: skippedBusiness() },
    { now: clock() },
  );
}

function fullFacts(overrides: Partial<CompanyEnrichmentFacts> = {}): CompanyEnrichmentFacts {
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

function fakeProvider(
  impl: (() => Promise<CompanyEnrichmentFacts>) | CompanyEnrichmentFacts,
): CompanyEnrichmentProvider {
  return {
    name: "fake-enrichment",
    enrich: typeof impl === "function" ? impl : async () => impl,
  };
}

function baseCompanyProfile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    identity: {
      legalName: "Przykładowa Spółka Sp. z o.o.",
      aliases: [],
      countryCode: "PL",
      identifiers: { krs: "0000123456", nip: "5270000000", regon: "142000000" },
    },
    location: { countryCode: "PL" },
    website: { verified: false },
    industry: { secondaryCodes: [], labels: [] },
    business: { productsServices: [], customerSegments: [], operatingMarkets: [] },
    ...overrides,
  };
}

test("(needsEnrichment) a legal-only assembly needs enrichment", () => {
  assert.equal(needsEnrichment(legalOnlyAssembly()), true);
});

test("(needsEnrichment) a complete assembly with real business facts does not need enrichment", () => {
  const assembly = assembleCompanyProfile(
    { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  assert.equal(needsEnrichment(assembly), false);
});

test("(mergeEnrichmentFacts) fills only the fields the profile is missing", () => {
  const profile = baseCompanyProfile({
    business: { description: "Istniejący opis.", productsServices: ["Istniejący produkt"], customerSegments: [], operatingMarkets: [] },
  });
  const merged = mergeEnrichmentFacts(profile, fullFacts());

  // Already-present fields are untouched.
  assert.equal(merged.business.description, "Istniejący opis.");
  assert.deepEqual(merged.business.productsServices, ["Istniejący produkt"]);
  // Missing fields are filled from the enrichment facts.
  assert.equal(merged.identity.foundedYear, 2005);
  assert.equal(merged.website.url, "https://przyklad.example");
  assert.equal(merged.website.verified, false);
  assert.deepEqual(merged.business.customerSegments, ["Banki"]);
  assert.deepEqual(merged.business.operatingMarkets, ["Polska", "Niemcy"]);
  // Legal identity/identifiers are never touched by enrichment.
  assert.equal(merged.identity.legalName, profile.identity.legalName);
  assert.deepEqual(merged.identity.identifiers, profile.identity.identifiers);
});

test("(mergeEnrichmentFacts) never mutates the input profile", () => {
  const profile = baseCompanyProfile();
  mergeEnrichmentFacts(profile, fullFacts());
  assert.equal(profile.business.description, undefined);
  assert.deepEqual(profile.business.productsServices, []);
});

test("(mergeEnrichmentFacts) a safe full URL (path/query/fragment) is reduced to origin-only", () => {
  const profile = baseCompanyProfile();
  const merged = mergeEnrichmentFacts(
    profile,
    fullFacts({ website: "https://przyklad.example/o-firmie?lang=pl#top" }),
  );
  assert.equal(merged.website.url, "https://przyklad.example");
  assert.equal(merged.website.domain, "przyklad.example");
});

test("(mergeEnrichmentFacts) an invalid/unnormalizable website never discards valid description/industry/products", () => {
  const profile = baseCompanyProfile();
  const merged = mergeEnrichmentFacts(profile, fullFacts({ website: "not a url at all" }));
  // The website simply stays unset...
  assert.equal(merged.website.url, undefined);
  // ...but every other valid enrichment fact is still applied.
  assert.equal(merged.business.description, fullFacts().description);
  assert.equal(merged.industry.description, fullFacts().industry);
  assert.equal(merged.identity.foundedYear, 2005);
  assert.deepEqual(merged.business.productsServices, ["Platforma płatnicza"]);
});

test("(enrichCompanyProfile) returns an enriched profile when research succeeds", async () => {
  const assembly = legalOnlyAssembly();
  const { profile: merged } = await enrichCompanyProfile(
    { assembly, company: krsCompany() },
    { provider: fakeProvider(fullFacts()) },
  );
  assert.equal(merged.business.description, "Firma dostarcza oprogramowanie dla sektora finansowego.");
  assert.equal(merged.industry.description, "Oprogramowanie finansowe");
  assert.equal(merged.identity.foundedYear, 2005);
  assert.equal(merged.website.url, "https://przyklad.example");
  assert.deepEqual(merged.business.productsServices, ["Platforma płatnicza"]);
});

test("(enrichCompanyProfile) emits an evidence-backed, origin-only website source for a discovered domain", async () => {
  const assembly = legalOnlyAssembly();
  const { sources, evidence } = await enrichCompanyProfile(
    { assembly, company: krsCompany() },
    { provider: fakeProvider(fullFacts({ website: "https://przyklad.example/o-nas?x=1#top" })), now: () => new Date("2026-07-14T10:00:00.000Z") },
  );

  assert.equal(sources.length, 1);
  const [source] = sources;
  // Origin-only: no path/query/fragment survives.
  assert.equal(source.url, "https://przyklad.example");
  assert.equal(source.domain, "przyklad.example");
  assert.equal(source.provider, "openai_web_search");
  assert.equal(source.type, "official_company_website");

  // The source is backed by evidence targeting the website fact.
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].target.path, "company.website.url");
  assert.deepEqual(evidence[0].sourceIds, [source.id]);
});

test("(enrichCompanyProfile) emits NO source when enrichment finds facts but no website", async () => {
  const assembly = legalOnlyAssembly();
  const { profile, sources, evidence } = await enrichCompanyProfile(
    { assembly, company: krsCompany() },
    { provider: fakeProvider(fullFacts({ website: null })) },
  );
  // Business facts are still merged...
  assert.equal(profile.business.description, "Firma dostarcza oprogramowanie dla sektora finansowego.");
  // ...but with no discovered origin there is nothing evidence-backed to cite.
  assert.deepEqual(sources, []);
  assert.deepEqual(evidence, []);
});

test("(enrichCompanyProfile) gracefully keeps the legal-only profile when the provider fails", async () => {
  const assembly = legalOnlyAssembly();
  const { profile, sources, evidence } = await enrichCompanyProfile(
    { assembly, company: krsCompany() },
    { provider: fakeProvider(async () => { throw new Error("provider unavailable"); }) },
  );
  assert.equal(profile, assembly.profile);
  assert.equal(profile.business.description, undefined);
  assert.deepEqual(profile.business.productsServices, []);
  assert.deepEqual(sources, []);
  assert.deepEqual(evidence, []);
});

test("(enrichCompanyProfile) rejects personal data anywhere in the enrichment output and falls back", async () => {
  const assembly = legalOnlyAssembly();
  const tainted = fullFacts({ description: "Firma powstała dzięki Janowi Kowalskiemu. Kontakt: biuro@przyklad.example" });
  const { profile, sources } = await enrichCompanyProfile(
    { assembly, company: krsCompany() },
    { provider: fakeProvider(tainted) },
  );
  // The personal-data guard rejects the merged result, so the legal-only
  // profile is kept unchanged instead of leaking the tainted description.
  assert.equal(profile.business.description, undefined);
  assert.equal(profile.identity.foundedYear, undefined);
  // A rejected/fallback enrichment contributes no source.
  assert.deepEqual(sources, []);
});

test("(enrichCompanyProfile) does not call the provider when the profile already has business facts", async () => {
  const assembly = assembleCompanyProfile(
    { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  let called = false;
  const { profile } = await enrichCompanyProfile(
    { assembly, company: krsCompany() },
    { provider: fakeProvider(async () => { called = true; return fullFacts(); }) },
  );
  assert.equal(called, false);
  assert.equal(profile, assembly.profile);
});

// --- Development logging: safe shape, no personal/company-identifying data ---

function captureConsoleInfo(): { calls: unknown[][]; restore: () => void } {
  const original = console.info;
  const calls: unknown[][] = [];
  console.info = (...args: unknown[]) => {
    calls.push(args);
  };
  return { calls, restore: () => { console.info = original; } };
}

function loggedPayload(calls: unknown[][]): Record<string, unknown> {
  const [, json] = calls[calls.length - 1] as [string, string];
  return JSON.parse(json) as Record<string, unknown>;
}

test("(logging) a skipped enrichment logs status 'skipped' with no reasonCode", async () => {
  const capture = captureConsoleInfo();
  try {
    const assembly = assembleCompanyProfile(
      { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
      { now: clock() },
    );
    await enrichCompanyProfile({ assembly, company: krsCompany() }, { provider: fakeProvider(fullFacts()) });
    const payload = loggedPayload(capture.calls);
    assert.deepEqual(payload, { stage: "enrichment", status: "skipped" });
  } finally {
    capture.restore();
  }
});

test("(logging) a successful enrichment logs status 'completed' with no reasonCode", async () => {
  const capture = captureConsoleInfo();
  try {
    await enrichCompanyProfile(
      { assembly: legalOnlyAssembly(), company: krsCompany() },
      { provider: fakeProvider(fullFacts()) },
    );
    const payload = loggedPayload(capture.calls);
    assert.deepEqual(payload, { stage: "enrichment", status: "completed" });
  } finally {
    capture.restore();
  }
});

test("(logging) a failing provider logs status 'fallback' with a stable, safe reasonCode", async () => {
  const capture = captureConsoleInfo();
  try {
    await enrichCompanyProfile(
      { assembly: legalOnlyAssembly(), company: krsCompany() },
      { provider: fakeProvider(async () => { throw new Error("some raw provider detail"); }) },
    );
    const payload = loggedPayload(capture.calls);
    assert.equal(payload.stage, "enrichment");
    assert.equal(payload.status, "fallback");
    assert.equal(typeof payload.reasonCode, "string");
    // Never the raw error message/company data — only a stable code.
    const dump = JSON.stringify(payload);
    assert.ok(!dump.includes("some raw provider detail"));
    assert.ok(!dump.includes("Przykładowa"));
  } finally {
    capture.restore();
  }
});

test("(logging) a personal-data rejection logs status 'fallback' with the privacy rule code, never the value", async () => {
  const capture = captureConsoleInfo();
  try {
    const tainted = fullFacts({ description: "Kontakt: biuro@przyklad.example" });
    await enrichCompanyProfile(
      { assembly: legalOnlyAssembly(), company: krsCompany() },
      { provider: fakeProvider(tainted) },
    );
    const payload = loggedPayload(capture.calls);
    assert.equal(payload.status, "fallback");
    assert.equal(payload.reasonCode, "EMAIL_ADDRESS");
    assert.ok(!JSON.stringify(payload).includes("biuro@przyklad.example"));
  } finally {
    capture.restore();
  }
});
