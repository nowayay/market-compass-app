import { test } from "node:test";
import assert from "node:assert/strict";
import { researchCompanyBusiness } from "../business-research/researchCompanyBusiness.ts";
import { createBusinessResearchBudget } from "../business-research/businessResearchBudget.ts";
import {
  BusinessResearchDisabledError,
  BusinessResearchError,
  BusinessResearchInvariantError,
  BusinessResearchPrivacyError,
  BusinessResearchRateLimitedError,
  InvalidBusinessResearchResponseError,
} from "../business-research/errors.ts";
import type { BusinessResearchBudget } from "../business-research/businessResearchBudget.ts";
import type {
  BusinessResearchInput,
  BusinessResearchProviderResult,
  CompanyBusinessResearchProvider,
  RawBusinessFacts,
} from "../business-research/types.ts";
import type {
  CompanyDomainResolutionResult,
  DomainResolutionStatus,
} from "../domain-resolution/types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";
import type { KrsCompany } from "../types.ts";

const ORIGIN = "https://przyklad.example";
const DOMAIN = "przyklad.example";

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "Jan Kowalski Consulting Sp. z o.o.",
  nip: "1234563218",
  regon: "123456785",
  city: "Kraków",
  region: "Małopolskie",
  countryCode: "PL",
  pkdPrimaryCode: "62.01.Z",
  pkdSecondaryCodes: [],
  pkdLabels: [],
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

function candidate(): EvaluatedDomainCandidate {
  return {
    origin: ORIGIN,
    domain: DOMAIN,
    status: "probable",
    score: 100,
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    signals: { matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null },
  };
}

function confirmation(o: Partial<DomainConfirmationResult> = {}): DomainConfirmationResult {
  return {
    status: "confirmed",
    confirmedOrigin: ORIGIN,
    verifiedIdentifiers: ["nip"],
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    ...o,
  };
}

function confirmedResolution(o: Partial<CompanyDomainResolutionResult> = {}): CompanyDomainResolutionResult {
  const c = candidate();
  return {
    status: "confirmed",
    confirmedOrigin: ORIGIN,
    selectedCandidate: c,
    evaluatedCandidates: [c],
    confirmation: confirmation(),
    reasons: [],
    sourceOrigins: [ORIGIN],
    ...o,
  };
}

function nonConfirmed(status: Exclude<DomainResolutionStatus, "confirmed">): CompanyDomainResolutionResult {
  return { status, confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [], confirmation: null, reasons: [], sourceOrigins: [] };
}

function facts(o: Partial<RawBusinessFacts> = {}): RawBusinessFacts {
  return { industryDescription: null, productsServices: [], customerSegments: [], operatingMarkets: [], ambiguityCodes: [], ...o };
}

const fullFacts = facts({
  industryDescription: "Custom software development",
  productsServices: ["Web applications"],
  customerSegments: ["SMEs"],
  operatingMarkets: ["Poland"],
});

type Handler = (input: BusinessResearchInput) => Promise<BusinessResearchProviderResult>;

function stubProvider(handler: Handler) {
  const calls: BusinessResearchInput[] = [];
  const provider: CompanyBusinessResearchProvider = {
    name: "stub",
    researchBusiness(input) {
      calls.push(input);
      return handler(input);
    },
  };
  return { provider, calls };
}

function countingBudget(inner: BusinessResearchBudget) {
  const counts = { acquired: 0, released: 0 };
  const budget: BusinessResearchBudget = {
    acquire() {
      counts.acquired += 1;
      const release = inner.acquire();
      return () => {
        counts.released += 1;
        release();
      };
    },
  };
  return { budget, counts };
}

const enabledBudget = () =>
  createBusinessResearchBudget({ enabled: true, windowMs: 10000, maxPerWindow: 10, maxConcurrent: 5 });
const now = () => new Date("2026-07-17T00:00:00.000Z");

// (1/2/3) every non-confirmed status → skipped, no provider call, no budget acquire
test("non-confirmed resolution statuses return skipped without provider/budget use", async () => {
  for (const status of ["unverified", "conflict", "not_found"] as const) {
    const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
    const { budget, counts } = countingBudget(enabledBudget());
    const r = await researchCompanyBusiness({ company: COMPANY, domainResolution: nonConfirmed(status) }, { provider, budget, now });
    assert.equal(r.status, "skipped");
    assert.deepEqual(r.reasons, ["DOMAIN_NOT_CONFIRMED"]);
    assert.equal(r.researchedOrigin, null);
    assert.equal(calls.length, 0);
    assert.equal(counts.acquired, 0);
  }
});

// (4/5) malformed confirmed resolution throws an invariant error
test("impossible confirmed states throw an invariant error (no downgrade)", async () => {
  const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const deps = { provider, budget: enabledBudget(), now };

  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution({ confirmedOrigin: null }) }, deps),
    BusinessResearchInvariantError,
  );
  await assert.rejects(
    () =>
      researchCompanyBusiness(
        { company: COMPANY, domainResolution: confirmedResolution({ confirmation: confirmation({ confirmedOrigin: "https://evil.example" }) }) },
        deps,
      ),
    BusinessResearchInvariantError,
  );
  assert.equal(calls.length, 0);
});

// (6/7/8) provider input allowlist + one call
test("confirmed path calls the provider once with only allowlisted fields (no identifiers/PKD)", async () => {
  const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const { budget, counts } = countingBudget(enabledBudget());
  const r = await researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now });

  assert.equal(r.status, "completed");
  assert.equal(calls.length, 1);
  const input = calls[0] as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(input).sort(), ["city", "countryCode", "legalName", "region", "targetDomain", "targetOrigin"]);
  const serialized = JSON.stringify(calls[0]);
  for (const v of [COMPANY.krs, COMPANY.nip!, COMPANY.regon!, "62.01.Z"]) assert.ok(!serialized.includes(v));
  assert.equal(input.targetOrigin, ORIGIN);
  assert.deepEqual(counts, { acquired: 1, released: 1 }); // (52) released after success
});

// valid no-fact output is unverified, not an operational error
test("a valid response with no acceptable facts → unverified (not an error)", async () => {
  const { provider } = stubProvider(async () => ({ facts: facts(), sourceOrigins: [ORIGIN] }));
  const r = await researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget: enabledBudget(), now });
  assert.equal(r.status, "unverified");
});

// (28) personal-data anywhere in provider output invalidates the WHOLE result
test("a personal-data leak in provider output throws a privacy error and releases the budget", async () => {
  const { provider } = stubProvider(async () => ({
    facts: facts({ productsServices: ["Contact us at info@example.com", "Clean product"] }),
    sourceOrigins: [ORIGIN],
  }));
  const { budget, counts } = countingBudget(enabledBudget());
  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }),
    BusinessResearchPrivacyError,
  );
  assert.deepEqual(counts, { acquired: 1, released: 1 }); // (52) released after failure
});

// Provider-boundary privacy guard (defense-in-depth): a stub provider bypasses
// the OpenAI parser, so the orchestrator must guard the complete provider facts
// BEFORE ambiguity handling can drop the offending category.

// A. email in productsServices + third_party_listing_scope (products would be dropped)
test("provider email + third_party_listing_scope → privacy error, budget released", async () => {
  const { provider, calls } = stubProvider(async () => ({
    facts: facts({ productsServices: ["contact@example.com"], ambiguityCodes: ["third_party_listing_scope"] }),
    sourceOrigins: [ORIGIN],
  }));
  const { budget, counts } = countingBudget(enabledBudget());
  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }),
    BusinessResearchPrivacyError,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(counts, { acquired: 1, released: 1 }); // acquired once, released once
});

// B. phone in a field + insufficient_business_evidence (all facts would be dropped)
test("provider phone + insufficient_business_evidence → privacy error, budget released", async () => {
  const { provider } = stubProvider(async () => ({
    facts: facts({ operatingMarkets: ["Poland, call +48 123 456 789"], ambiguityCodes: ["insufficient_business_evidence"] }),
    sourceOrigins: [ORIGIN],
  }));
  const { budget, counts } = countingBudget(enabledBudget());
  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }),
    BusinessResearchPrivacyError,
  );
  assert.deepEqual(counts, { acquired: 1, released: 1 });
});

// C. a clean stub still continues into result construction
test("a clean stub provider still produces a completed result", async () => {
  const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const r = await researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget: enabledBudget(), now });
  assert.equal(r.status, "completed");
  assert.equal(calls.length, 1);
  assert.ok(r.facts.productsServices.length >= 1);
});

// (49) disabled / rate-limited budget throws and performs no provider call
test("disabled budget throws and never calls the provider", async () => {
  const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const budget = createBusinessResearchBudget({ enabled: false, windowMs: 1000, maxPerWindow: 10, maxConcurrent: 1 });
  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }),
    BusinessResearchDisabledError,
  );
  assert.equal(calls.length, 0);
});

test("rate-limited budget throws and never calls the provider", async () => {
  const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const budget = createBusinessResearchBudget({ enabled: true, windowMs: 10000, maxPerWindow: 1, maxConcurrent: 10 });
  budget.acquire()(); // exhaust the window
  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }),
    BusinessResearchRateLimitedError,
  );
  assert.equal(calls.length, 0);
});

// (50) provider operational failures propagate (never converted to a status)
test("provider failures propagate as operational errors and release the budget", async () => {
  for (const err of [new BusinessResearchError("boom"), new InvalidBusinessResearchResponseError()]) {
    const { provider } = stubProvider(async () => {
      throw err;
    });
    const { budget, counts } = countingBudget(enabledBudget());
    await assert.rejects(
      () => researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }),
      (e: unknown) => e === err,
    );
    assert.deepEqual(counts, { acquired: 1, released: 1 });
  }
});

// (51) caller cancellation propagates distinctly
test("caller cancellation propagates and releases the budget", async () => {
  const controller = new AbortController();
  const { provider } = stubProvider(async () => {
    controller.abort();
    throw new DOMException("aborted", "AbortError");
  });
  const { budget, counts } = countingBudget(enabledBudget());
  await assert.rejects(() =>
    researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget, now }, { signal: controller.signal }),
  );
  assert.deepEqual(counts, { acquired: 1, released: 1 });
});

// person-like legal company name is permitted (approved input path)
test("a person-like legal company name does not trip the input privacy guard", async () => {
  const { provider } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const r = await researchCompanyBusiness({ company: COMPANY, domainResolution: confirmedResolution() }, { provider, budget: enabledBudget(), now });
  assert.equal(r.status, "completed");
});

// (E) each confirmed-resolution invariant, mutated independently, throws BEFORE
// any budget acquisition or provider call.
async function expectInvariant(resolution: CompanyDomainResolutionResult) {
  const { provider, calls } = stubProvider(async () => ({ facts: fullFacts, sourceOrigins: [ORIGIN] }));
  const { budget, counts } = countingBudget(enabledBudget());
  await assert.rejects(
    () => researchCompanyBusiness({ company: COMPANY, domainResolution: resolution }, { provider, budget, now }),
    BusinessResearchInvariantError,
  );
  assert.equal(calls.length, 0, "provider must not be invoked");
  assert.equal(counts.acquired, 0, "budget must not be acquired");
}

test("no verified identifiers → invariant, no budget, no provider call", async () => {
  await expectInvariant(confirmedResolution({ confirmation: confirmation({ verifiedIdentifiers: [] }) }));
});

test("empty confirmation sources → invariant", async () => {
  await expectInvariant(confirmedResolution({ confirmation: confirmation({ sourceOrigins: [] }), sourceOrigins: [] }));
});

test("an unrelated (subdomain) confirmation source → invariant", async () => {
  const bad = "https://blog.przyklad.example";
  await expectInvariant(confirmedResolution({ confirmation: confirmation({ sourceOrigins: [bad] }), sourceOrigins: [bad] }));
});

test("top-level / confirmation source-set mismatch → invariant", async () => {
  await expectInvariant(
    confirmedResolution({
      confirmation: confirmation({ sourceOrigins: [ORIGIN] }),
      sourceOrigins: [ORIGIN, "https://www.przyklad.example"],
    }),
  );
});

test("selected candidate not probable → invariant", async () => {
  const c = { ...candidate(), status: "unverified" as const };
  await expectInvariant(confirmedResolution({ selectedCandidate: c, evaluatedCandidates: [c] }));
});

test("zero probable evaluated candidates → invariant", async () => {
  const c = { ...candidate(), status: "unverified" as const };
  await expectInvariant(confirmedResolution({ selectedCandidate: candidate(), evaluatedCandidates: [c] }));
});

test("multiple probable evaluated candidates → invariant", async () => {
  const other = { ...candidate(), origin: "https://przyklad2.example", domain: "przyklad2.example" };
  await expectInvariant(confirmedResolution({ evaluatedCandidates: [candidate(), other] }));
});

test("selected candidate absent from the sole probable candidate → invariant", async () => {
  const other = { ...candidate(), origin: "https://other.example", domain: "other.example" };
  await expectInvariant(confirmedResolution({ selectedCandidate: candidate(), evaluatedCandidates: [other] }));
});

test("selected candidate domain mismatch → invariant", async () => {
  const c = { ...candidate(), domain: "other.example" };
  await expectInvariant(confirmedResolution({ selectedCandidate: c, evaluatedCandidates: [c] }));
});
