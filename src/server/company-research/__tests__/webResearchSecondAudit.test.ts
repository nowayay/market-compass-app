/**
 * Regression tests for the SECOND independent Codex audit of the internal
 * Company Web Research orchestration (findings A-E). These exercise the
 * PRODUCTION `orchestrateCompanyWebResearch` function wherever practical, per
 * the audit's explicit instruction that helper-level tests may supplement but
 * not replace orchestrator-level tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { orchestrateCompanyWebResearch } from "../web-research/orchestrateCompanyWebResearch.ts";
import { CompanyWebResearchInvariantError } from "../web-research/errors.ts";
import { DomainResolutionInvariantError } from "../domain-resolution/errors.ts";
import { BusinessResearchInvariantError } from "../business-research/errors.ts";
import { ProfileAssemblyInvariantError } from "../profile-assembly/errors.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import {
  clock,
  CLOCK_AT,
  completedBusiness,
  completedBusinessAtSourceOrigin,
  confirmedResolution,
  DOMAIN,
  krsCompany,
  notFoundResolution,
  ORIGIN,
  productsOnlyBusiness,
  skippedBusiness,
  unverifiedBusiness,
  unverifiedResolution,
} from "./profileAssemblyFixtures.ts";
import type { CompanyWebResearchDeps } from "../web-research/types.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { StructuredBusinessResearchResult } from "../business-research/types.ts";
import type { CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";
import type { KrsCompany } from "../types.ts";

// --- shared harness (mirrors orchestrateCompanyWebResearch.test.ts) -----------

interface Harness {
  deps: CompanyWebResearchDeps;
  domainCalls: unknown[];
  businessCalls: unknown[];
  assemblyCalls: unknown[];
  nowCalls: number;
}

function harness(opts: {
  domainResolution?: unknown;
  businessResearch?: unknown;
  assembleCompanyProfileOverride?: (input: unknown) => unknown;
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
        // These overrides target OTHER invariants (shape, privacy, timestamp
        // mismatch, ...), not the orchestrator's tracked-clock contract itself
        // — so stand in for a well-behaved dependency's single clock read
        // before returning the canned/tainted result. A test that genuinely
        // needs to exercise zero/duplicate clock reads builds its own `deps`
        // directly instead of going through this shared harness.
        deps2.now();
        return opts.assembleCompanyProfileOverride(input);
      }
      return assembleCompanyProfile(
        input as Parameters<typeof assembleCompanyProfile>[0],
        deps2,
      );
    },
    now: () => {
      nowCalls++;
      return clock()();
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

function baseCandidate(): EvaluatedDomainCandidate {
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

/** A confirmed resolution built from an explicit candidate + verifiedIdentifiers set. */
function confirmedWith(candidate: EvaluatedDomainCandidate, verifiedIdentifiers: Array<"krs" | "nip" | "regon">): CompanyDomainResolutionResult {
  return {
    status: "confirmed",
    confirmedOrigin: ORIGIN,
    selectedCandidate: candidate,
    evaluatedCandidates: [candidate],
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

const COMPANY = krsCompany(); // krs "0000123456", nip "5270000000", regon "142000000"

// ============================================================================
// Part A — value-bearing ownership proof (HIGH 1)
// ============================================================================

test("(A-orch 1) verified KRS with null matchedKrs is rejected", async () => {
  const candidate = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedKrs: null } };
  const h = harness({ domainResolution: confirmedWith(candidate, ["krs"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
  assert.equal(h.assemblyCalls.length, 0);
});

test("(A-orch 2) verified NIP with only matchedKrs present is rejected", async () => {
  const candidate = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedKrs: "0000123456", matchedNip: null } };
  const h = harness({ domainResolution: confirmedWith(candidate, ["nip"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
});

test("(A-orch 3) verified REGON with only matchedNip present is rejected", async () => {
  const candidate = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedNip: "5270000000", matchedRegon: null } };
  const h = harness({ domainResolution: confirmedWith(candidate, ["regon"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
});

test("(A-orch 4) all identifier signals null with a non-empty verifiedIdentifiers claim is rejected", async () => {
  const candidate = baseCandidate(); // all matched* already null
  const h = harness({ domainResolution: confirmedWith(candidate, ["nip"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(A-orch 5) selected candidate signal present but evaluated candidate signal missing is rejected", async () => {
  const selected = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedNip: "5270000000" } };
  const evaluated = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedNip: null } };
  const resolution: CompanyDomainResolutionResult = {
    ...confirmedWith(selected, ["nip"]),
    evaluatedCandidates: [evaluated],
  };
  const h = harness({ domainResolution: resolution });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(A-orch 6) selected/evaluated candidate signal mismatch is rejected", async () => {
  const selected = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedNip: "5270000000" } };
  const evaluated = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedNip: "9999999990" } };
  const resolution: CompanyDomainResolutionResult = {
    ...confirmedWith(selected, ["nip"]),
    evaluatedCandidates: [evaluated],
  };
  const h = harness({ domainResolution: resolution });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(A-orch 7) claimed identifier absent from the supplied company is rejected", async () => {
  const companyWithoutRegon = krsCompany({ regon: undefined });
  const candidate = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedRegon: "142000000" } };
  const h = harness({ domainResolution: confirmedWith(candidate, ["regon"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: companyWithoutRegon }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(A-orch 8) a claimed identifier value that cannot be normalized is rejected", async () => {
  const candidate = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedNip: "not-a-nip!!" } };
  const h = harness({ domainResolution: confirmedWith(candidate, ["nip"]) });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(A-orch 9) a genuinely valid confirmed resolution with full value-bearing proof still passes", async () => {
  const candidate = { ...baseCandidate(), signals: { ...baseCandidate().signals, matchedKrs: "0000123456", matchedNip: "5270000000", matchedRegon: "142000000" } };
  const h = harness({ domainResolution: confirmedWith(candidate, ["krs", "nip", "regon"]) });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.domainResolution.status, "confirmed");
});

// ============================================================================
// Part B — prototype-safety (HIGH 2)
// ============================================================================

/** Builds an object whose OWN keys omit `key`, inherited instead from a fresh
 * prototype carrying `value` for that key — `Object.hasOwn` is false for it. */
function withInheritedField<T extends Record<string, unknown>>(obj: T, key: keyof T, value: unknown): T {
  const rest: Record<string, unknown> = { ...obj };
  delete rest[key as string];
  const proto = { [key]: value };
  return Object.assign(Object.create(proto), rest) as T;
}

function withCustomPrototype<T extends object>(obj: T, proto: object): T {
  return Object.assign(Object.create(proto), obj) as T;
}

class EvilSource {
  id = "src_web_evil";
  provider = "openai_web_search";
  type = "official_company_website";
  authority = "primary";
  url = ORIGIN;
  domain = DOMAIN;
  retrievedAt = CLOCK_AT;
  publishedAt = null;
}

test("(B-orch 1) inherited facts field (industryDescription carrying an email) is rejected, not read through", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(
    base.facts as unknown as Record<string, unknown>,
    "industryDescription",
    "Contact us at leak@example.com",
  );
  const business = { ...base, facts: tainted };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  // The inherited value is invisible to `Object.hasOwn`, so the field reads as
  // ABSENT (null-equivalent for the exact-shape check would fail differently);
  // either way, the leaked email must never reach the returned clone.
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 2) inherited facts field carrying a phone number is rejected", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(
    base.facts as unknown as Record<string, unknown>,
    "industryDescription",
    "Zadzwon: +48 123 456 789",
  );
  const business = { ...base, facts: tainted };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 3) inherited facts field carrying a PESEL-shaped number is rejected", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(
    base.facts as unknown as Record<string, unknown>,
    "industryDescription",
    "Numer 12345678901 na dokumencie",
  );
  const business = { ...base, facts: tainted };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 4) inherited facts field carrying a personal-profile URL is rejected", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(
    base.facts as unknown as Record<string, unknown>,
    "industryDescription",
    "Zobacz linkedin.com/in/jankowalski",
  );
  const business = { ...base, facts: tainted };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 5) inherited facts field carrying person-role text is rejected", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(
    base.facts as unknown as Record<string, unknown>,
    "industryDescription",
    "Kontakt: Anna Nowak",
  );
  const business = { ...base, facts: tainted };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 6) an inherited (non-own) profile from a malformed Profile Assembly stub is rejected", async () => {
  const validProfile = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted = withInheritedField(
    validProfile as unknown as Record<string, unknown>,
    "profile",
    validProfile.profile,
  );
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 7) inherited (non-own) sources array from a malformed stub is rejected", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(base as unknown as Record<string, unknown>, "sources", base.sources);
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 8) inherited (non-own) evidence array from a malformed stub is rejected", async () => {
  const base = completedBusiness();
  const tainted = withInheritedField(base as unknown as Record<string, unknown>, "evidence", base.evidence);
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 9) inherited (non-own) candidate signals object is rejected", async () => {
  const candidate = baseCandidate();
  const taintedCandidate = withInheritedField(
    candidate as unknown as Record<string, unknown>,
    "signals",
    candidate.signals,
  );
  const resolution = { ...confirmedWith(candidate, []), selectedCandidate: taintedCandidate, evaluatedCandidates: [taintedCandidate] };
  const h = harness({ domainResolution: resolution });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

test("(B-orch 10) inherited (non-own) evidence target is rejected", async () => {
  const base = completedBusiness();
  const taintedEvidence = base.evidence.map((e, i) =>
    i === 0 ? withInheritedField(e as unknown as Record<string, unknown>, "target", e.target) : e,
  );
  const business = { ...base, evidence: taintedEvidence };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

// NOTE: an object whose prototype is a one-level custom object (e.g.
// `Object.create({ contactPerson: "..." })`) is ALREADY rejected outright by
// `isPlainObject` (its prototype is not exactly `Object.prototype` — see
// B-orch 14), so it can never reach the "inherited-but-still-Object.prototype
// -rooted" case these two tests must exercise. The ONLY way an inherited
// field can survive the prototype check at all is genuine GLOBAL
// `Object.prototype` pollution (mirroring B-orch 15, with different keys) —
// the object's OWN prototype identity is untouched, but a bare property read
// would still resolve the polluted value via the (unmodified) prototype chain.

test("(B-orch 11) a prototype-polluted contactPerson field never surfaces in the output", async () => {
  (Object.prototype as unknown as Record<string, unknown>).contactPerson = "Jan Kowalski";
  try {
    const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
    const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
    const dump = JSON.stringify(r);
    assert.ok(!dump.includes("contactPerson"));
    assert.ok(!dump.includes("Jan Kowalski"));
  } finally {
    delete (Object.prototype as unknown as Record<string, unknown>).contactPerson;
  }
});

test("(B-orch 12) a prototype-polluted sourceSnippet field never surfaces in the output", async () => {
  (Object.prototype as unknown as Record<string, unknown>).sourceSnippet = "raw page text mentioning a person";
  try {
    const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
    const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
    const dump = JSON.stringify(r);
    assert.ok(!dump.includes("sourceSnippet"));
  } finally {
    delete (Object.prototype as unknown as Record<string, unknown>).sourceSnippet;
  }
});

test("(B-orch 13) a class instance in place of a plain result object is rejected", async () => {
  const base = completedBusiness();
  const businessWithClassSource = { ...base, sources: [new EvilSource()] };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: businessWithClassSource });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(B-orch 14) an object with a custom (non-Object.prototype) prototype is rejected", async () => {
  const base = completedBusiness();
  const customProtoFacts = withCustomPrototype(base.facts as unknown as object, { extra: "evil" });
  const business = { ...base, facts: customProtoFacts };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(B-orch 15) global Object.prototype pollution never leaks an inherited field into the result", async () => {
  const pollutedKey = "contactPerson";
  (Object.prototype as unknown as Record<string, unknown>)[pollutedKey] = "Polluted Person";
  try {
    const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
    const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
    const dump = JSON.stringify(r);
    assert.ok(!dump.includes("Polluted Person"));
  } finally {
    delete (Object.prototype as unknown as Record<string, unknown>)[pollutedKey];
  }
});

test("(B-orch 16) an unexpected SYMBOL key on a stage result is rejected", async () => {
  const base = completedBusiness();
  const tainted = { ...base } as Record<PropertyKey, unknown>;
  tainted[Symbol("evil")] = "smuggled";
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(B-orch 17) a non-enumerable own unknown key on a stage result is rejected", async () => {
  const base = completedBusiness();
  const tainted = { ...base };
  Object.defineProperty(tainted, "contactPerson", { value: "Jan Kowalski", enumerable: false });
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(B-orch 18) a null-prototype object is rejected (explicit policy: not supported)", async () => {
  const base = completedBusiness();
  const nullProtoFacts = Object.assign(Object.create(null), base.facts);
  const business = { ...base, facts: nullProtoFacts };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: business });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

// ============================================================================
// Part C — sparse arrays (MEDIUM 3)
// ============================================================================

function sparse<T>(...items: T[]): T[] {
  const arr: T[] = new Array(items.length + 1);
  items.forEach((item, i) => {
    arr[i] = item;
  });
  // index `items.length` is left as a HOLE (never assigned).
  arr.length = items.length + 2;
  arr[items.length + 1] = items[items.length - 1];
  return arr;
}

test("(C-orch 1) a sparse sourceOrigins array on the domain resolution is rejected", async () => {
  const base = confirmedResolution();
  const tainted = { ...base, sourceOrigins: sparse(ORIGIN) };
  const h = harness({ domainResolution: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    DomainResolutionInvariantError,
  );
});

test("(C-orch 2) a sparse evaluatedCandidates array is rejected", async () => {
  const base = confirmedResolution();
  const tainted = { ...base, evaluatedCandidates: sparse(base.evaluatedCandidates[0]) };
  const h = harness({ domainResolution: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    DomainResolutionInvariantError,
  );
});

test("(C-orch 3) a sparse business productsServices array is rejected", async () => {
  const base = completedBusiness();
  const tainted = { ...base, facts: { ...base.facts, productsServices: sparse(base.facts.productsServices[0]) } };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(C-orch 4) a sparse business sources array is rejected", async () => {
  const base = completedBusiness();
  const tainted = { ...base, sources: sparse(base.sources[0]) };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(C-orch 5) a sparse evidence sourceIds array is rejected", async () => {
  const base = completedBusiness();
  const tainted = {
    ...base,
    evidence: base.evidence.map((e, i) => (i === 0 ? { ...e, sourceIds: sparse(e.sourceIds[0]) } : e)),
  };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    BusinessResearchInvariantError,
  );
});

test("(C-orch 6) a sparse reasons array is rejected", async () => {
  const base = confirmedResolution();
  const tainted = { ...base, reasons: sparse("CONFIRMATION_CONFIRMED" as const) };
  const h = harness({ domainResolution: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    DomainResolutionInvariantError,
  );
});

test("(C-orch 7) a sparse profile industry secondaryCodes array is rejected", async () => {
  const validResult = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted: CompanyProfileAssemblyResult = {
    ...validResult,
    profile: { ...validResult.profile, industry: { ...validResult.profile.industry, secondaryCodes: sparse("10.11.Z") } },
  };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

test("(C-orch 8) a sparse assembly sources array is rejected", async () => {
  const validResult = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted: CompanyProfileAssemblyResult = { ...validResult, sources: sparse(validResult.sources[0]) };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

// ============================================================================
// Part E — exact non-confirmed domain status matrix (MEDIUM 2)
// ============================================================================

function candidateFor(status: "probable" | "unverified" | "rejected") {
  return { ...baseCandidate(), status };
}

const forbiddenCombinations: Array<{ name: string; resolution: CompanyDomainResolutionResult }> = [
  {
    name: "not_found with a selected candidate",
    resolution: { status: "not_found", confirmedOrigin: null, selectedCandidate: candidateFor("probable"), evaluatedCandidates: [], confirmation: null, reasons: ["NO_DISCOVERY_CANDIDATES"], sourceOrigins: [] },
  },
  {
    name: "not_found with evaluated candidates",
    resolution: { status: "not_found", confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [candidateFor("unverified")], confirmation: null, reasons: ["NO_DISCOVERY_CANDIDATES"], sourceOrigins: [] },
  },
  {
    name: "not_found with a confirmation payload",
    resolution: { status: "not_found", confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [], confirmation: { status: "unverified", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: [], sourceOrigins: [] }, reasons: ["NO_DISCOVERY_CANDIDATES"], sourceOrigins: [] },
  },
  {
    name: "not_found with non-empty sourceOrigins",
    resolution: { status: "not_found", confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [], confirmation: null, reasons: ["NO_DISCOVERY_CANDIDATES"], sourceOrigins: [ORIGIN] },
  },
  {
    name: "not_found with confirmation-specific reasons",
    resolution: { status: "not_found", confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [], confirmation: null, reasons: ["CONFIRMATION_CONFIRMED"], sourceOrigins: [] },
  },
  {
    name: "conflict without a conflict confirmation",
    resolution: { status: "conflict", confirmedOrigin: null, selectedCandidate: candidateFor("probable"), evaluatedCandidates: [candidateFor("probable")], confirmation: { status: "unverified", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: [], sourceOrigins: [] }, reasons: ["CONFIRMATION_CONFLICT"], sourceOrigins: [] },
  },
  {
    name: "conflict with a non-null confirmedOrigin",
    resolution: { status: "conflict", confirmedOrigin: ORIGIN, selectedCandidate: candidateFor("probable"), evaluatedCandidates: [candidateFor("probable")], confirmation: { status: "conflict", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: ["NIP_CONFLICT"], sourceOrigins: [] }, reasons: ["CONFIRMATION_CONFLICT"], sourceOrigins: [] },
  },
  {
    name: "unverified status with a confirmed confirmation",
    resolution: { status: "unverified", confirmedOrigin: null, selectedCandidate: candidateFor("probable"), evaluatedCandidates: [candidateFor("probable")], confirmation: { status: "confirmed", confirmedOrigin: ORIGIN, verifiedIdentifiers: ["nip"], reasons: [], conflicts: [], sourceOrigins: [ORIGIN] }, reasons: ["CONFIRMATION_UNVERIFIED"], sourceOrigins: [] },
  },
  {
    name: "evaluation-only unverified carrying a confirmation payload",
    resolution: { status: "unverified", confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [candidateFor("unverified")], confirmation: { status: "unverified", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: [], sourceOrigins: [] }, reasons: ["NO_PROBABLE_CANDIDATE"], sourceOrigins: [] },
  },
  {
    name: "confirmation-unverified with a missing selected candidate",
    resolution: { status: "unverified", confirmedOrigin: null, selectedCandidate: null, evaluatedCandidates: [candidateFor("probable")], confirmation: { status: "unverified", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: [], sourceOrigins: [] }, reasons: ["CONFIRMATION_UNVERIFIED"], sourceOrigins: [] },
  },
  {
    name: "confirmation-unverified with a non-probable selected candidate",
    resolution: { status: "unverified", confirmedOrigin: null, selectedCandidate: candidateFor("unverified"), evaluatedCandidates: [candidateFor("unverified")], confirmation: { status: "unverified", confirmedOrigin: null, verifiedIdentifiers: [], reasons: [], conflicts: [], sourceOrigins: [] }, reasons: ["CONFIRMATION_UNVERIFIED"], sourceOrigins: [] },
  },
];

for (const { name, resolution } of forbiddenCombinations) {
  test(`(E-orch) forbidden combination is rejected: ${name}`, async () => {
    const h = harness({ domainResolution: resolution });
    await assert.rejects(
      () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
      DomainResolutionInvariantError,
    );
    assert.equal(h.businessCalls.length, 0);
    assert.equal(h.assemblyCalls.length, 0);
  });
}

test("(E-orch valid) not_found → skipped business research → legal_only assembly still passes", async () => {
  const h = harness({ domainResolution: notFoundResolution(), businessResearch: skippedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.domainResolution.status, "not_found");
  assert.equal(r.profileAssembly.status, "legal_only");
});

test("(E-orch valid) evaluation-only unverified (no probable) → skipped → legal_only still passes", async () => {
  const h = harness({
    domainResolution: {
      status: "unverified",
      confirmedOrigin: null,
      selectedCandidate: null,
      evaluatedCandidates: [candidateFor("unverified")],
      confirmation: null,
      reasons: ["NO_PROBABLE_CANDIDATE"],
      sourceOrigins: [],
    },
    businessResearch: skippedBusiness(),
  });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.profileAssembly.status, "legal_only");
});

test("(E-orch valid) confirmation-unverified (realistic) → skipped → legal_only still passes", async () => {
  const h = harness({ domainResolution: unverifiedResolution(), businessResearch: skippedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(r.domainResolution.status, "unverified");
  assert.equal(r.profileAssembly.status, "legal_only");
});

// ============================================================================
// Part D — exact assembly timestamp relationships (MEDIUM 1)
// ============================================================================

test("(D-orch 1) website evidence timestamp differing from a NEW website source timestamp is rejected", async () => {
  const valid = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const evidence = valid.evidence.map((e) =>
    e.target.path === "company.website.url" ? { ...e, verifiedAt: "2030-01-01T00:00:00.000Z" } : e,
  );
  const tainted: CompanyProfileAssemblyResult = { ...valid, evidence };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

// A business result attested at the `www.` counterpart of the confirmed apex
// origin: still on-target (apex/www are treated as equivalent), but a
// DIFFERENT origin string, so `assembleCompanyProfile` cannot reuse it as the
// website source — it creates a genuinely NEW one from the assembly clock,
// giving these two tests an independent, assembly-created record to
// cross-check the description evidence against.
function businessWithNewWebsite(): StructuredBusinessResearchResult {
  return completedBusinessAtSourceOrigin("https://www.przyklad.example");
}

test("(D-orch 2) description evidence timestamp differing from the assembly-created website source is rejected", async () => {
  const valid = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: businessWithNewWebsite() },
    { now: clock() },
  );
  const newWebsiteSource = valid.sources.find((s) => s.type === "official_company_website" && s.url === ORIGIN);
  assert.ok(newWebsiteSource, "expected a genuinely NEW website source in this fixture");
  const evidence = valid.evidence.map((e) =>
    e.target.path === "company.business.description" ? { ...e, verifiedAt: "2030-06-01T00:00:00.000Z" } : e,
  );
  assert.notEqual("2030-06-01T00:00:00.000Z", newWebsiteSource!.retrievedAt);
  const tainted: CompanyProfileAssemblyResult = { ...valid, evidence };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: businessWithNewWebsite(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

test("(D-orch 3) two assembly-generated evidence records using different (but each individually valid) ISO times is rejected", async () => {
  // Same scenario as D-orch 2, framed from the "two generated records disagree"
  // angle: the NEW website source's retrievedAt stays at the real clock value
  // while description evidence verifiedAt is bumped to a DIFFERENT valid ISO
  // instant — both individually well-formed, but mutually inconsistent.
  const valid = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: businessWithNewWebsite() },
    { now: clock() },
  );
  const newWebsiteSource = valid.sources.find((s) => s.type === "official_company_website" && s.url === ORIGIN);
  assert.ok(newWebsiteSource, "expected a genuinely NEW website source in this fixture");
  const evidence = valid.evidence.map((e) =>
    e.target.path === "company.business.description" ? { ...e, verifiedAt: "2027-03-03T03:03:03.000Z" } : e,
  );
  const tainted: CompanyProfileAssemblyResult = { ...valid, evidence };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: businessWithNewWebsite(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
});

// THIRD-AUDIT UPDATE (MEDIUM B): this used to assert that arbitrary but
// self-consistent forged timestamps still pass. That was exactly the gap the
// third audit found — the cross-stage validator derived its timestamp anchor
// from the untrusted result, so a dependency that ignored the tracked clock
// entirely and returned a result built from a DIFFERENT clock (self-consistent
// among itself) was wrongly accepted. The orchestrator now tracks the ONE
// clock read Profile Assembly itself must perform; a result built ahead of
// time from an unrelated clock never touches that tracked wrapper, so it is
// now correctly rejected (see `webResearchThirdAudit.test.ts` for the full
// tracked-clock regression coverage).
test("(D-orch 4) a result built from a DIFFERENT (untracked) clock — even if internally self-consistent — is now rejected", async () => {
  const future = "2099-12-31T23:59:59.000Z";
  const valid = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: () => new Date(future) },
  );
  // A raw custom `deps` (NOT the shared `harness()` helper) — this dependency
  // genuinely never touches the tracked clock it was given, which is exactly
  // what this test must exercise.
  const deps: CompanyWebResearchDeps = {
    resolveCompanyDomain: async () => confirmedResolution(),
    researchCompanyBusiness: async () => completedBusiness(),
    assembleCompanyProfile: () => valid,
    now: clock(),
  };
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, deps),
    CompanyWebResearchInvariantError,
  );
});

test("(D-orch 5) a reused business source with an altered (mismatched) website evidence timestamp is rejected", async () => {
  // Business research already provides a source AT the confirmed origin, so
  // the assembler REUSES it (never creates a new website source/evidence pair
  // from the assembly clock) — the website evidence must mirror that reused
  // source's OWN retrievedAt exactly.
  const business = completedBusiness();
  const reusedSourceRetrievedAt = business.sources.find((s) => s.url === ORIGIN)?.retrievedAt;
  assert.ok(reusedSourceRetrievedAt);
  const valid = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: business },
    { now: clock() },
  );
  const evidence = valid.evidence.map((e) =>
    e.target.path === "company.website.url" ? { ...e, verifiedAt: "2028-08-08T08:08:08.000Z" } : e,
  );
  assert.notEqual("2028-08-08T08:08:08.000Z", reusedSourceRetrievedAt);
  const tainted: CompanyProfileAssemblyResult = { ...valid, evidence };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: business,
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

test("(D-orch 6) a genuinely valid real-assembler output passes end to end (every status)", async () => {
  const cases: Array<{ domainResolution: CompanyDomainResolutionResult; businessResearch: StructuredBusinessResearchResult }> = [
    { domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { domainResolution: confirmedResolution(), businessResearch: productsOnlyBusiness() },
    { domainResolution: confirmedResolution(), businessResearch: unverifiedBusiness() },
    { domainResolution: notFoundResolution(), businessResearch: skippedBusiness() },
  ];
  for (const c of cases) {
    const h = harness(c);
    await assert.doesNotReject(() => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps));
  }
});

test("(D-orch 7) the cross-stage validator never invokes deps.now — only assembleCompanyProfile does, exactly once", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  assert.equal(h.nowCalls, 1);
});

// ============================================================================
// F — regression: previous fixes still hold (spot checks)
// ============================================================================

test("(F-orch 1) raw validation still runs before cloning: an exact page URL in an origin field is rejected before any clone escapes", async () => {
  const base = confirmedResolution();
  const tainted = { ...base, sourceOrigins: [`${ORIGIN}/kontakt`] };
  const h = harness({ domainResolution: tainted });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    DomainResolutionInvariantError,
  );
});

test("(F-orch 2) deep detachment still holds after the rewrite", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: COMPANY }, h.deps);
  const before = r.profileAssembly.sources.length;
  r.domainResolution.evaluatedCandidates.push({ ...r.domainResolution.evaluatedCandidates[0] });
  assert.equal(r.profileAssembly.sources.length, before);
});

test("(F-orch 3) deterministic repeated execution still gives semantically identical output", async () => {
  const h1 = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const h2 = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r1 = await orchestrateCompanyWebResearch({ company: COMPANY }, h1.deps);
  const r2 = await orchestrateCompanyWebResearch({ company: COMPANY }, h2.deps);
  assert.deepEqual(r1, r2);
});

// ============================================================================
// G — error identity
// ============================================================================

test("(G-orch 1) the orchestrator does not catch and replace a privacy error — it propagates as PersonalDataLeakError", async () => {
  const validProfile = assembleCompanyProfile(
    { company: COMPANY, domainResolution: confirmedResolution(), businessResearch: completedBusiness() },
    { now: clock() },
  );
  const tainted: CompanyProfileAssemblyResult = {
    ...validProfile,
    profile: { ...validProfile.profile, business: { ...validProfile.profile.business, description: "Contact us at leak@example.com" } },
  };
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    assembleCompanyProfileOverride: () => tainted,
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: COMPANY }, h.deps),
    PersonalDataLeakError,
  );
});
