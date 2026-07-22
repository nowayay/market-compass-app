import { test } from "node:test";
import assert from "node:assert/strict";
import { assertDomainResolutionBelongsToCompany } from "../web-research/invariants.ts";
import { CompanyWebResearchInvariantError } from "../web-research/errors.ts";
import { assertValidDomainResolutionResultShape } from "../domain-resolution/resultSchema.ts";
import { DomainResolutionInvariantError } from "../domain-resolution/errors.ts";
import { assertValidBusinessResearchResultShape } from "../business-research/resultSchema.ts";
import { BusinessResearchInvariantError } from "../business-research/errors.ts";
import { assertValidProfileAssemblyResultShape } from "../profile-assembly/resultSchema.ts";
import { assertProfileAssemblyResultMatchesInputs } from "../profile-assembly/validateAssemblyResult.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { ProfileAssemblyInvariantError } from "../profile-assembly/errors.ts";
import {
  clock,
  CLOCK_AT,
  completedBusiness,
  confirmedResolution,
  DOMAIN,
  krsCompany,
  notFoundResolution,
  ORIGIN,
  partialBusiness,
  skippedBusiness,
  unverifiedBusiness,
  unverifiedResolution,
} from "./profileAssemblyFixtures.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { StructuredBusinessResearchResult } from "../business-research/types.ts";
import type { CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";

// ============================================================================
// Part A — company/domain-resolution ownership
// ============================================================================

test("(A1) valid supplied-company identifiers continue to pass", () => {
  assert.doesNotThrow(() => assertDomainResolutionBelongsToCompany(krsCompany(), confirmedResolution()));
});

test("(A2) foreign KRS evidence on the selected candidate throws", () => {
  const base = confirmedResolution();
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, signals: { ...base.selectedCandidate!.signals, matchedKrs: "0000999999" } },
  };
  assert.throws(
    () => assertDomainResolutionBelongsToCompany(krsCompany(), tainted),
    CompanyWebResearchInvariantError,
  );
});

test("(A3) foreign NIP evidence on the selected candidate throws", () => {
  const base = confirmedResolution();
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, signals: { ...base.selectedCandidate!.signals, matchedNip: "9999999990" } },
  };
  assert.throws(
    () => assertDomainResolutionBelongsToCompany(krsCompany(), tainted),
    CompanyWebResearchInvariantError,
  );
});

test("(A4) foreign REGON evidence on the selected candidate throws", () => {
  const base = confirmedResolution();
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, signals: { ...base.selectedCandidate!.signals, matchedRegon: "999999999" } },
  };
  assert.throws(
    () => assertDomainResolutionBelongsToCompany(krsCompany(), tainted),
    CompanyWebResearchInvariantError,
  );
});

test("(A5) mixed matching and mismatching verified identifiers throws (any mismatch is fatal)", () => {
  const base = confirmedResolution();
  // matchedNip agrees with the company; matchedRegon is foreign.
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    selectedCandidate: {
      ...base.selectedCandidate!,
      signals: { ...base.selectedCandidate!.signals, matchedNip: "5270000000", matchedRegon: "999999999" },
    },
  };
  assert.throws(
    () => assertDomainResolutionBelongsToCompany(krsCompany(), tainted),
    CompanyWebResearchInvariantError,
  );
});

test("(A6) a candidate signal claiming an identifier the company does not have throws", () => {
  const base = confirmedResolution();
  const companyWithoutRegon = krsCompany({ regon: undefined });
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, signals: { ...base.selectedCandidate!.signals, matchedRegon: "142000000" } },
  };
  assert.throws(
    () => assertDomainResolutionBelongsToCompany(companyWithoutRegon, tainted),
    CompanyWebResearchInvariantError,
  );
});

test("(A7) a verifiedIdentifiers type the company does not have throws", () => {
  const base = confirmedResolution();
  const companyWithoutRegon = krsCompany({ regon: undefined });
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    confirmation: { ...base.confirmation!, verifiedIdentifiers: ["nip", "regon"] },
  };
  assert.throws(
    () => assertDomainResolutionBelongsToCompany(companyWithoutRegon, tainted),
    CompanyWebResearchInvariantError,
  );
});

test("(A8) a non-confirmed resolution has nothing to own and is never checked", () => {
  assert.doesNotThrow(() => assertDomainResolutionBelongsToCompany(krsCompany(), notFoundResolution()));
  assert.doesNotThrow(() => assertDomainResolutionBelongsToCompany(krsCompany(), unverifiedResolution()));
});

test("(A9) an ownership violation never contains the identifier value, legal name or domain in its message", () => {
  const base = confirmedResolution();
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, signals: { ...base.selectedCandidate!.signals, matchedKrs: "0000999999" } },
  };
  try {
    assertDomainResolutionBelongsToCompany(krsCompany(), tainted);
    assert.fail("expected a throw");
  } catch (error) {
    assert.ok(error instanceof CompanyWebResearchInvariantError);
    const message = (error as Error).message;
    for (const forbidden of ["0000999999", "0000123456", DOMAIN, krsCompany().legalName]) {
      assert.ok(!message.includes(forbidden), `message unexpectedly contains "${forbidden}"`);
    }
  }
});

// ============================================================================
// Part B/C — strict raw-shape + origin-field validation
// ============================================================================

test("(B1) domain resolution: an unexpected top-level field is rejected", () => {
  const tainted = { ...confirmedResolution(), contactPerson: "Jan Kowalski" };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(B2) domain resolution: an unexpected field on the selected candidate is rejected", () => {
  const base = confirmedResolution();
  const tainted = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, owner: "Jan Kowalski" },
  };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(B3) domain resolution: an unexpected field on the confirmation payload is rejected", () => {
  const base = confirmedResolution();
  const tainted = { ...base, confirmation: { ...base.confirmation!, email: "leak@example.com" } };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(B4) domain resolution: an unexpected field inside candidate signals is rejected", () => {
  const base = confirmedResolution();
  const tainted = {
    ...base,
    selectedCandidate: { ...base.selectedCandidate!, signals: { ...base.selectedCandidate!.signals, sourceSnippet: "..." } },
  };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C1) domain resolution: malformed confirmedOrigin text is rejected", () => {
  const tainted = { ...confirmedResolution(), confirmedOrigin: "not a url" };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C2) domain resolution: a candidate origin carrying a path is rejected", () => {
  const base = confirmedResolution();
  const tainted = {
    ...base,
    evaluatedCandidates: [{ ...base.evaluatedCandidates[0], origin: `${ORIGIN}/o-nas` }],
  };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C3) domain resolution: a sourceOrigins entry carrying a query is rejected", () => {
  const tainted = { ...confirmedResolution(), sourceOrigins: [`${ORIGIN}?ref=1`] };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C4) domain resolution: a confirmation sourceOrigins entry carrying a fragment is rejected", () => {
  const base = confirmedResolution();
  const tainted = { ...base, confirmation: { ...base.confirmation!, sourceOrigins: [`${ORIGIN}#section`] } };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C5) domain resolution: a URL carrying credentials is rejected", () => {
  const tainted = { ...confirmedResolution(), sourceOrigins: ["https://user:pass@przyklad.example"] };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C6) domain resolution: a non-HTTP scheme is rejected", () => {
  const tainted = { ...confirmedResolution(), confirmedOrigin: "ftp://przyklad.example" };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C7) domain resolution: a candidate domain that disagrees with its own origin hostname is rejected", () => {
  const base = confirmedResolution();
  const tainted = {
    ...base,
    evaluatedCandidates: [{ ...base.evaluatedCandidates[0], domain: "different.example" }],
  };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C8) domain resolution: a non-confirmed status retaining a confirmedOrigin is rejected", () => {
  const tainted = { ...unverifiedResolution(), confirmedOrigin: ORIGIN };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(C9) domain resolution: a non-confirmed status retaining a confirmed confirmation payload is rejected", () => {
  const base = unverifiedResolution();
  const tainted = { ...base, confirmation: { ...base.confirmation!, status: "confirmed" as const, confirmedOrigin: ORIGIN } };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});

test("(B5) business research: an unexpected top-level field (e.g. sourceSnippet) is rejected", () => {
  const tainted = { ...completedBusiness(), sourceSnippet: "raw page text" };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(B6) business research: an unexpected field inside facts is rejected", () => {
  const base = completedBusiness();
  const tainted = { ...base, facts: { ...base.facts, founder: "Jan Kowalski" } };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(B7) business research: an unexpected field on a source (e.g. title) is rejected", () => {
  const base = completedBusiness();
  const tainted = { ...base, sources: [{ ...base.sources[0], title: "Company homepage" }] };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(B8) business research: an unexpected field on evidence (e.g. pageContent) is rejected", () => {
  const base = completedBusiness();
  const tainted = { ...base, evidence: [{ ...base.evidence[0], pageContent: "..." }] };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(C10) business research: researchedOrigin carrying a path (exact page URL) is rejected", () => {
  const base = completedBusiness();
  const tainted = { ...base, researchedOrigin: `${ORIGIN}/about` };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(C11) business research: a source url carrying a query is rejected", () => {
  const base = completedBusiness();
  const tainted = { ...base, sources: [{ ...base.sources[0], url: `${base.sources[0].url}?utm=1` }] };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(C12) business research: a source domain that disagrees with its own url hostname is rejected", () => {
  const base = completedBusiness();
  const tainted = { ...base, sources: [{ ...base.sources[0], domain: "different.example" }] };
  assert.throws(() => assertValidBusinessResearchResultShape(tainted), BusinessResearchInvariantError);
});

test("(B9) profile assembly: an unexpected top-level field is rejected", () => {
  const assembled = assembleCompanyProfile(
    { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted = { ...assembled, employee: "Jan Kowalski" };
  assert.throws(() => assertValidProfileAssemblyResultShape(tainted), ProfileAssemblyInvariantError);
});

test("(B10) profile assembly: an unexpected field on the profile (e.g. representative) is rejected", () => {
  const assembled = assembleCompanyProfile(
    { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted = { ...assembled, profile: { ...assembled.profile, representative: "Jan Kowalski" } };
  assert.throws(() => assertValidProfileAssemblyResultShape(tainted), ProfileAssemblyInvariantError);
});

test("(C13) profile assembly: a website url carrying a fragment is rejected", () => {
  const assembled = assembleCompanyProfile(
    { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted = { ...assembled, profile: { ...assembled.profile, website: { ...assembled.profile.website, url: `${ORIGIN}#top` } } };
  assert.throws(() => assertValidProfileAssemblyResultShape(tainted), ProfileAssemblyInvariantError);
});

test("(C14) profile assembly: a source off the target domain is rejected by the cross-stage consistency validator", () => {
  // The generic raw-shape validator does not know about the confirmed target scope
  // (that is business-research/profile-assembly semantics), so this is exercised
  // through the full cross-stage validator instead.
  const businessResearch = completedBusiness();
  const offTarget: StructuredBusinessResearchResult = {
    ...businessResearch,
    sources: businessResearch.sources.map((s) => ({ ...s, url: "https://off-target.example", domain: "off-target.example" })),
  };
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: offTarget };
  assert.throws(() => {
    const raw = assembleCompanyProfile(input, { now: clock() });
    assertProfileAssemblyResultMatchesInputs(input, raw, CLOCK_AT);
  });
});

// ============================================================================
// Part D — strict cross-stage Profile Assembly consistency
// ============================================================================

function assemble(input: Parameters<typeof assembleCompanyProfile>[0]): CompanyProfileAssemblyResult {
  return assembleCompanyProfile(input, { now: clock() });
}

test("(D1) a genuinely valid assembly result passes for every status", () => {
  const cases: Array<{ domainResolution: CompanyDomainResolutionResult; businessResearch: StructuredBusinessResearchResult }> = [
    { domainResolution: confirmedResolution(), businessResearch: completedBusiness() }, // complete
    { domainResolution: confirmedResolution(), businessResearch: partialBusiness() }, // partial
    { domainResolution: confirmedResolution(), businessResearch: unverifiedBusiness() }, // partial (website only)
    { domainResolution: notFoundResolution(), businessResearch: skippedBusiness() }, // legal_only
    { domainResolution: unverifiedResolution(), businessResearch: skippedBusiness() }, // legal_only
  ];
  for (const c of cases) {
    const company = krsCompany();
    const input = { company, ...c };
    const result = assemble(input);
    assert.doesNotThrow(() => assertProfileAssemblyResultMatchesInputs(input, result, CLOCK_AT));
  }
});

test("(D2) altered legal name is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, identity: { ...result.profile.identity, legalName: "Inna Nazwa Sp. z o.o." } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D3) altered website is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, website: { ...result.profile.website, url: "https://evil.example", domain: "evil.example" } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D4) altered industry description is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, industry: { ...result.profile.industry, description: "Completely different" } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D5) altered productsServices is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, business: { ...result.profile.business, productsServices: ["Invented product"] } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D6) altered customerSegments is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, business: { ...result.profile.business, customerSegments: ["Invented segment"] } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D7) altered operatingMarkets is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, business: { ...result.profile.business, operatingMarkets: ["Invented market"] } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D8) altered status is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, status: "partial" as const };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D9) altered reasons is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, reasons: [...result.reasons].reverse() };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D10) an altered source URL is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const idx = result.sources.findIndex((s) => s.provider === "openai_web_search");
  const sources = [...result.sources];
  sources[idx] = { ...sources[idx], url: "https://altered.example", domain: "altered.example" };
  const tainted = { ...result, sources };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D11) an altered source ID is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const sources = result.sources.map((s) => ({ ...s, id: `${s.id}_x` }));
  const tainted = { ...result, sources };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D12) an altered source semantic field (authority) is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const idx = result.sources.findIndex((s) => s.provider === "krs");
  const sources = [...result.sources];
  sources[idx] = { ...sources[idx], authority: "secondary" };
  const tainted = { ...result, sources };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D13) an altered evidence target is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const evidence = [...result.evidence];
  evidence[0] = { ...evidence[0], target: { ...evidence[0].target, path: "company.identity.displayName" } };
  const tainted = { ...result, evidence };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D14) an altered evidence itemId is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const idx = result.evidence.findIndex((e) => e.target.itemId !== null);
  assert.ok(idx >= 0);
  const evidence = [...result.evidence];
  evidence[idx] = { ...evidence[idx], target: { ...evidence[idx].target, itemId: "itm_altered" } };
  const tainted = { ...result, evidence };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D15) altered evidence sourceIds is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const evidence = [...result.evidence];
  evidence[0] = { ...evidence[0], sourceIds: [result.sources[0].id, result.sources[1]?.id ?? result.sources[0].id].filter((v, i, a) => a.indexOf(v) === i) };
  const tainted = { ...result, evidence };
  // Only assert a throw when this actually changed something material.
  if (JSON.stringify(evidence[0].sourceIds) !== JSON.stringify(result.evidence[0].sourceIds)) {
    assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
  }
});

test("(D16) altered evidence derivation is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const evidence = [...result.evidence];
  evidence[0] = { ...evidence[0], derivation: evidence[0].derivation === "registry" ? "extracted" : "registry" };
  const tainted = { ...result, evidence };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D17) altered evidence support is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const evidence = [...result.evidence];
  evidence[0] = { ...evidence[0], support: evidence[0].support === "direct" ? "corroborating" : "direct" };
  const tainted = { ...result, evidence };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D18) altered evidence confidence is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const evidence = [...result.evidence];
  evidence[0] = { ...evidence[0], confidence: 0.01 };
  const tainted = { ...result, evidence };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D19) an additional (extra) source is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, sources: [...result.sources, { ...result.sources[0], id: "src_extra_injected" }] };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D20) a missing source is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, sources: result.sources.slice(1) };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D21) additional (extra) evidence is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, evidence: [...result.evidence, { ...result.evidence[0], id: "fev_extra_injected" }] };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D22) missing evidence is rejected", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, evidence: result.evidence.slice(1) };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D23) not_found → skipped → legal_only carrying invented business content throws", () => {
  const input = { company: krsCompany(), domainResolution: notFoundResolution(), businessResearch: skippedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, business: { ...result.profile.business, productsServices: ["Invented"] } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D24) conflict → skipped → legal_only carrying a website throws", () => {
  const conflict: CompanyDomainResolutionResult = {
    status: "conflict",
    confirmedOrigin: null,
    selectedCandidate: confirmedResolution().selectedCandidate,
    evaluatedCandidates: [],
    confirmation: { status: "conflict", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: ["NIP_CONFLICT"], sourceOrigins: [] },
    reasons: ["CONFIRMATION_CONFLICT"],
    sourceOrigins: [],
  };
  const input = { company: krsCompany(), domainResolution: conflict, businessResearch: skippedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, website: { url: ORIGIN, domain: DOMAIN, verified: true } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D25) unverified domain → skipped result carrying business content throws", () => {
  const input = { company: krsCompany(), domainResolution: unverifiedResolution(), businessResearch: skippedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, industry: { ...result.profile.industry, description: "Invented" } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D26) confirmed → unverified research → partial assembly carrying business facts throws", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: unverifiedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, business: { ...result.profile.business, productsServices: ["Invented"] } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D27) skipped/unverified research producing a complete assembly throws", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: unverifiedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, status: "complete" as const };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D28) confirmed completed research with altered profile facts throws", () => {
  const input = { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: completedBusiness() };
  const result = assemble(input);
  const tainted = { ...result, profile: { ...result.profile, business: { ...result.profile.business, customerSegments: [] } } };
  assert.throws(() => assertProfileAssemblyResultMatchesInputs(input, tainted, CLOCK_AT), ProfileAssemblyInvariantError);
});

test("(D29) a contradictory non-confirmed resolution (retaining confirmed-only fields) is already rejected upstream", () => {
  // Reuse established domain-resolution validators — this is rejected before
  // this cross-stage validator would even be reached in the real pipeline.
  const tainted = { ...unverifiedResolution(), confirmedOrigin: ORIGIN };
  assert.throws(() => assertValidDomainResolutionResultShape(tainted), DomainResolutionInvariantError);
});
