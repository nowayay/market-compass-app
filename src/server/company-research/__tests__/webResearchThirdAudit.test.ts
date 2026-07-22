/**
 * Regression tests for the THIRD independent Codex audit of the internal
 * Company Web Research orchestration (two remaining MEDIUM findings):
 *
 *   A. the ownership invariant did not validate an unclaimed identifier signal
 *      present ONLY on the evaluated candidate (asymmetric selected/evaluated
 *      validation);
 *   B. the cross-stage consistency validator derived its assembly-clock
 *      "anchor" from Profile Assembly's own (untrusted) raw output, so a
 *      dependency that forged every assembly-owned timestamp to the same
 *      arbitrary value (e.g. year 2099) passed as "internally consistent".
 *
 * These exercise the PRODUCTION `orchestrateCompanyWebResearch` function
 * wherever practical, per the standing instruction that helper-level tests may
 * supplement but not replace orchestrator-level tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { orchestrateCompanyWebResearch } from "../web-research/orchestrateCompanyWebResearch.ts";
import { CompanyWebResearchInvariantError } from "../web-research/errors.ts";
import { createTrackedAssemblyClock } from "../web-research/assemblyClock.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { ProfileAssemblyInvariantError } from "../profile-assembly/errors.ts";
import { assertDenseArray } from "../shared/runtimeShape.ts";
import {
  clock,
  completedBusiness,
  completedBusinessAtSourceOrigin,
  confirmedResolution,
  DOMAIN,
  krsCompany,
  notFoundResolution,
  ORIGIN,
  skippedBusiness,
} from "./profileAssemblyFixtures.ts";
import type { CompanyWebResearchDeps } from "../web-research/types.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";
import type { KrsCompany } from "../types.ts";

const COMPANY = krsCompany(); // krs "0000123456", nip "5270000000", regon "142000000"

// ============================================================================
// Shared harness
// ============================================================================

interface Harness {
  deps: CompanyWebResearchDeps;
  domainCalls: unknown[];
  businessCalls: unknown[];
  assemblyCalls: unknown[];
  nowCalls: number;
}

function harness(opts: {
  domainResolution?: CompanyDomainResolutionResult;
  businessResearch?: unknown;
  now?: () => Date;
  assembleCompanyProfileOverride?: (input: unknown, deps2: { now: () => Date }) => unknown;
}): Harness {
  const domainCalls: unknown[] = [];
  const businessCalls: unknown[] = [];
  const assemblyCalls: unknown[] = [];
  let nowCalls = 0;

  const deps = {
    async resolveCompanyDomain(company: KrsCompany) {
      domainCalls.push(company);
      return opts.domainResolution ?? confirmedResolution();
    },
    async researchCompanyBusiness(request: unknown) {
      businessCalls.push(request);
      return opts.businessResearch ?? completedBusiness();
    },
    assembleCompanyProfile(input: unknown, deps2: { now: () => Date }) {
      assemblyCalls.push(input);
      if (opts.assembleCompanyProfileOverride !== undefined) {
        return opts.assembleCompanyProfileOverride(input, deps2);
      }
      return assembleCompanyProfile(input as Parameters<typeof assembleCompanyProfile>[0], deps2);
    },
    now: () => {
      nowCalls++;
      return (opts.now ?? clock())();
    },
  } as unknown as CompanyWebResearchDeps;

  return {
    deps,
    domainCalls,
    businessCalls,
    assemblyCalls,
    get nowCalls() {
      return nowCalls;
    },
  } as Harness;
}

function candidateWith(
  signals: Partial<{ matchedKrs: string | null; matchedNip: string | null; matchedRegon: string | null }>,
): EvaluatedDomainCandidate {
  return {
    origin: ORIGIN,
    domain: DOMAIN,
    status: "probable",
    score: 100,
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    signals: {
      matchedLegalName: null,
      matchedKrs: null,
      matchedNip: null,
      matchedRegon: null,
      matchedCity: null,
      ...signals,
    },
  };
}

function confirmedWith(
  selected: EvaluatedDomainCandidate,
  evaluated: EvaluatedDomainCandidate,
  verifiedIdentifiers: Array<"krs" | "nip" | "regon">,
): CompanyDomainResolutionResult {
  return {
    status: "confirmed",
    confirmedOrigin: ORIGIN,
    selectedCandidate: selected,
    evaluatedCandidates: [evaluated],
    confirmation: {
      status: "confirmed",
      confirmedOrigin: ORIGIN,
      verifiedIdentifiers,
      reasons: [],
      conflicts: [],
      sourceOrigins: [ORIGIN],
    },
    reasons: ["CONFIRMATION_CONFIRMED"],
    sourceOrigins: [ORIGIN],
  };
}

// ============================================================================
// Part A — symmetric selected/evaluated identifier ownership (MEDIUM A)
// ============================================================================

test("(TA-1) claimed NIP proven on both candidates plus a foreign UNCLAIMED evaluated-only REGON is rejected", async () => {
  const selected = candidateWith({ matchedNip: "5270000000", matchedRegon: null });
  const evaluated = candidateWith({ matchedNip: "5270000000", matchedRegon: "999999999" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["nip"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
  assert.equal(h.assemblyCalls.length, 0);
});

test("(TA-2) claimed KRS proven on both candidates plus a foreign evaluated-only NIP is rejected", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedNip: null });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedNip: "9999999990" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
});

// TA-3..TA-7 each pair their unclaimed scenario with a genuinely PROVEN claimed
// KRS (on both candidates) — `assertConfirmedResolutionTarget` independently
// requires at least one claimed verified identifier for a confirmed resolution
// to be structurally valid at all, so without it these would be rejected by
// that earlier structural check instead of the unclaimed-signal logic under
// test here.

test("(TA-3) an unclaimed value present on the selected candidate only (evaluated null) is rejected", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedRegon: "142000000" });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedRegon: null });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
});

test("(TA-4) an unclaimed value present on the evaluated candidate only (selected null) is rejected", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedRegon: null });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedRegon: "142000000" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
});

test("(TA-5) unclaimed selected/evaluated values that differ from each other are rejected", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedRegon: "142000000" });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedRegon: "999999999" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(TA-6) an unclaimed signal that agrees selected/evaluated but disagrees with the company is rejected", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedNip: "9999999990" });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedNip: "9999999990" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(TA-7) an unclaimed value present on both candidates that fails normalization is rejected", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedNip: "not-a-nip!!" });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedNip: "not-a-nip!!" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(TA-valid) matching unclaimed values present on BOTH candidates and agreeing with the company still pass", async () => {
  // `assertConfirmedResolutionTarget` independently requires at least one
  // CLAIMED verified identifier for a confirmed resolution to be structurally
  // valid at all — so this exercises a claimed KRS (proven on both candidates)
  // PLUS an unclaimed-but-present-and-agreeing REGON on both candidates, which
  // is exactly the "matching unclaimed values on both candidates" case.
  const selected = candidateWith({ matchedKrs: "0000123456", matchedRegon: "142000000" });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedRegon: "142000000" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.domainResolution.status, "confirmed");
});

test("(TA-8) the ownership error message never leaks an identifier value, type, legal name or domain", async () => {
  const selected = candidateWith({ matchedKrs: "0000123456", matchedRegon: null });
  const evaluated = candidateWith({ matchedKrs: "0000123456", matchedRegon: "142000000" });
  const h = harness({ domainResolution: confirmedWith(selected, evaluated, ["krs"]) });
  try {
    await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
    assert.fail("expected a rejection");
  } catch (error) {
    assert.ok(error instanceof CompanyWebResearchInvariantError);
    const message = (error as Error).message;
    for (const forbidden of ["142000000", "regon", "REGON", DOMAIN, COMPANY.legalName]) {
      assert.ok(!message.includes(forbidden), `message unexpectedly contains "${forbidden}"`);
    }
  }
});

// ============================================================================
// Part B — trusted (tracked) assembly clock (MEDIUM B)
// ============================================================================

const TRUSTED_AT = "2031-05-05T05:05:05.000Z";
const FORGED_FUTURE = "2099-12-31T23:59:59.000Z";

/** Forces the assembler to create a genuinely NEW website source (business
 * research attests a DIFFERENT-but-on-target origin than the confirmed one). */
function businessWithNewWebsite() {
  return completedBusinessAtSourceOrigin("https://www.przyklad.example");
}

test("(TB-1) createTrackedAssemblyClock forwards the first call and records its ISO timestamp", () => {
  const tracked = createTrackedAssemblyClock(() => new Date(TRUSTED_AT));
  const returned = tracked.now();
  assert.equal(returned.toISOString(), TRUSTED_AT);
  assert.equal(tracked.callCount(), 1);
  assert.equal(tracked.recordedTimestamp(), TRUSTED_AT);
});

test("(TB-2) createTrackedAssemblyClock throws on a second invocation without re-calling the original clock", () => {
  let underlyingCalls = 0;
  const tracked = createTrackedAssemblyClock(() => {
    underlyingCalls++;
    return new Date(TRUSTED_AT);
  });
  tracked.now();
  assert.throws(() => tracked.now(), CompanyWebResearchInvariantError);
  assert.equal(underlyingCalls, 1);
  assert.equal(tracked.callCount(), 2);
});

test("(TB-3) a dependency that forges every assembly-owned timestamp to a self-consistent future value is rejected", async () => {
  const real = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: businessWithNewWebsite() },
    { now: () => new Date(TRUSTED_AT) },
  );
  const forged: CompanyProfileAssemblyResult = {
    ...real,
    sources: real.sources.map((s) =>
      s.type === "official_company_website" && s.url === ORIGIN ? { ...s, retrievedAt: FORGED_FUTURE } : s,
    ),
    evidence: real.evidence.map((e) =>
      e.target.path === "company.website.url" || e.target.path === "company.business.description"
        ? { ...e, verifiedAt: FORGED_FUTURE }
        : e,
    ),
  };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: businessWithNewWebsite(),
    now: () => new Date(TRUSTED_AT),
    // A well-behaved dependency still reads the tracked clock exactly once —
    // it just ignores what it got back and returns pre-forged values instead.
    assembleCompanyProfileOverride: (_input, deps2) => {
      deps2.now();
      return forged;
    },
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

test("(TB-4) a dependency that ignores the supplied tracked clock and returns a result built from an unrelated clock is rejected", async () => {
  const valid = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: () => new Date(FORGED_FUTURE) },
  );
  const deps: CompanyWebResearchDeps = {
    resolveCompanyDomain: async () => confirmedResolution(),
    researchCompanyBusiness: async () => completedBusiness(),
    assembleCompanyProfile: () => valid, // never touches the injected clock at all
    now: clock(),
  };
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, deps),
    CompanyWebResearchInvariantError,
  );
});

test("(TB-5) a dependency that reads the tracked clock twice is rejected", async () => {
  const fallback = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const deps: CompanyWebResearchDeps = {
    resolveCompanyDomain: async () => confirmedResolution(),
    researchCompanyBusiness: async () => completedBusiness(),
    assembleCompanyProfile: (_input, deps2) => {
      deps2.now();
      deps2.now(); // the SECOND read must throw before this function can return
      return fallback;
    },
    now: clock(),
  };
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, deps),
    CompanyWebResearchInvariantError,
  );
});

test("(TB-6) a genuine, well-behaved assembly run reads the tracked clock exactly once and passes", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(h.nowCalls, 1);
  assert.equal(r.profileAssembly.status, "complete");
});

test("(TB-7) a newly created website source and its evidence both use the trusted clock", async () => {
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: businessWithNewWebsite(),
    now: () => new Date(TRUSTED_AT),
  });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  const websiteSource = r.profileAssembly.sources.find(
    (s) => s.type === "official_company_website" && s.url === ORIGIN,
  );
  assert.ok(websiteSource);
  assert.equal(websiteSource!.retrievedAt, TRUSTED_AT);
  const websiteEvidence = r.profileAssembly.evidence.find((e) => e.target.path === "company.website.url");
  assert.ok(websiteEvidence);
  assert.equal(websiteEvidence!.verifiedAt, TRUSTED_AT);
});

test("(TB-8) description evidence uses the trusted clock", async () => {
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: businessWithNewWebsite(),
    now: () => new Date(TRUSTED_AT),
  });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  const descriptionEvidence = r.profileAssembly.evidence.find(
    (e) => e.target.path === "company.business.description",
  );
  assert.ok(descriptionEvidence);
  assert.equal(descriptionEvidence!.verifiedAt, TRUSTED_AT);
});

test("(TB-9) a reused upstream website source preserves its own upstream retrievedAt, not the trusted clock", async () => {
  const business = completedBusiness(); // attests exactly the confirmed ORIGIN → reused
  const upstreamRetrievedAt = business.sources.find((s) => s.url === ORIGIN)?.retrievedAt;
  assert.ok(upstreamRetrievedAt);
  assert.notEqual(upstreamRetrievedAt, TRUSTED_AT);
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business, now: () => new Date(TRUSTED_AT) });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  const websiteSource = r.profileAssembly.sources.find(
    (s) => s.type === "official_company_website" && s.url === ORIGIN,
  );
  assert.ok(websiteSource);
  assert.equal(websiteSource!.retrievedAt, upstreamRetrievedAt);
  assert.notEqual(websiteSource!.retrievedAt, TRUSTED_AT);
});

test("(TB-10) reused-source website evidence mirrors the reused source's own retrievedAt, not the trusted clock", async () => {
  const business = completedBusiness();
  const upstreamRetrievedAt = business.sources.find((s) => s.url === ORIGIN)?.retrievedAt;
  assert.ok(upstreamRetrievedAt);
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business, now: () => new Date(TRUSTED_AT) });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  const websiteEvidence = r.profileAssembly.evidence.find((e) => e.target.path === "company.website.url");
  assert.ok(websiteEvidence);
  assert.equal(websiteEvidence!.verifiedAt, upstreamRetrievedAt);
  assert.notEqual(websiteEvidence!.verifiedAt, TRUSTED_AT);
});

test("(TB-11) a reused-website (description-only-generated-record) flow still passes end to end", async () => {
  const business = completedBusiness();
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business, now: () => new Date(TRUSTED_AT) });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.profileAssembly.status, "complete");
  const descriptionEvidence = r.profileAssembly.evidence.find(
    (e) => e.target.path === "company.business.description",
  );
  assert.ok(descriptionEvidence);
  assert.equal(descriptionEvidence!.verifiedAt, TRUSTED_AT);
});

test("(TB-12) a flow with no generated website source and no description still passes, clock still read exactly once", async () => {
  const h = harness({
    domainResolution: notFoundResolution(),
    businessResearch: skippedBusiness(),
    now: () => new Date(TRUSTED_AT),
  });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.profileAssembly.status, "legal_only");
  assert.equal(h.nowCalls, 1);
});

test("(TB-13) every real valid status flow still passes with the tracked clock in place", async () => {
  const cases: Array<{ domainResolution: CompanyDomainResolutionResult; businessResearch: unknown }> = [
    { domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { domainResolution: confirmedResolution(), businessResearch: businessWithNewWebsite() },
    { domainResolution: notFoundResolution(), businessResearch: skippedBusiness() },
  ];
  for (const c of cases) {
    const h = harness(c);
    await assert.doesNotReject(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
  }
});

test("(TB-14) a stage-thrown Profile Assembly error still propagates as the exact same instance", async () => {
  const expectedError = new ProfileAssemblyInvariantError("boom");
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    assembleCompanyProfileOverride: (_input, deps2) => {
      deps2.now();
      throw expectedError;
    },
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    (e: unknown) => e === expectedError,
  );
});

// ============================================================================
// Part D (optional) — narrow sparse-array shape coverage
// ============================================================================

function fail(message: string): never {
  throw new Error(message);
}

test("(TD-1) a hole at index zero is rejected as a sparse array", () => {
  const arr = new Array(2);
  arr[1] = "b";
  assert.throws(() => assertDenseArray(arr, (item) => item, fail, "array"));
});

test("(TD-2) a trailing hole is rejected as a sparse array", () => {
  const arr = ["a"];
  arr.length = 2; // trailing hole at index 1
  assert.throws(() => assertDenseArray(arr, (item) => item, fail, "array"));
});

test("(TD-3) a deleted index is rejected as a sparse array", () => {
  const arr = ["a", "b", "c"];
  delete arr[1];
  assert.throws(() => assertDenseArray(arr, (item) => item, fail, "array"));
});

test("(TD-4) a non-index own array property is rejected", () => {
  const arr = ["a", "b"] as unknown as Record<PropertyKey, unknown>;
  arr.evil = "smuggled";
  assert.throws(() => assertDenseArray(arr, (item) => item, fail, "array"));
});

test("(TD-5) a symbol own array property is rejected", () => {
  const arr = ["a", "b"] as unknown as Record<PropertyKey, unknown>;
  arr[Symbol("evil")] = "smuggled";
  assert.throws(() => assertDenseArray(arr, (item) => item, fail, "array"));
});

test("(TD-6) a genuinely dense array still passes", () => {
  const arr = ["a", "b", "c"];
  const out = assertDenseArray(arr, (item) => item, fail, "array");
  assert.deepEqual(out, arr);
  assert.notEqual(out, arr);
});
