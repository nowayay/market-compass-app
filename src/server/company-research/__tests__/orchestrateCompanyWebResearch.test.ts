import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { orchestrateCompanyWebResearch } from "../web-research/orchestrateCompanyWebResearch.ts";
import { CompanyWebResearchInvariantError } from "../web-research/errors.ts";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { ProfileAssemblyInvariantError } from "../profile-assembly/errors.ts";
import { BusinessResearchInvariantError } from "../business-research/errors.ts";
import { DomainDiscoveryTimeoutError } from "../domain-discovery/errors.ts";
import { DomainResolutionInvariantError } from "../domain-resolution/errors.ts";
import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import {
  clock,
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
import type { CompanyWebResearchDeps, CompanyWebResearchResult } from "../web-research/types.ts";
import type { CompanyDomainResolutionResult } from "../domain-resolution/types.ts";
import type { StructuredBusinessResearchResult } from "../business-research/types.ts";
import type { CompanyProfileAssemblyInput, CompanyProfileAssemblyResult } from "../profile-assembly/types.ts";
import type { KrsCompany } from "../types.ts";

// --- shared stub plumbing -----------------------------------------------------

interface Harness {
  deps: CompanyWebResearchDeps;
  domainCalls: KrsCompany[];
  businessCalls: Array<{ company: KrsCompany; domainResolution: CompanyDomainResolutionResult }>;
  assemblyCalls: CompanyProfileAssemblyInput[];
  order: string[];
}

function harness(opts: {
  domainResolution?: CompanyDomainResolutionResult | (() => Promise<CompanyDomainResolutionResult>);
  businessResearch?: StructuredBusinessResearchResult | (() => Promise<StructuredBusinessResearchResult>);
  assemblyResult?: CompanyProfileAssemblyResult;
  useRealAssembly?: boolean;
  /** Directly overrides the assembleCompanyProfile stub (e.g. to make it throw). */
  assembleCompanyProfileOverride?: (
    input: CompanyProfileAssemblyInput,
  ) => CompanyProfileAssemblyResult;
}): Harness {
  const domainCalls: KrsCompany[] = [];
  const businessCalls: Array<{ company: KrsCompany; domainResolution: CompanyDomainResolutionResult }> = [];
  const assemblyCalls: CompanyProfileAssemblyInput[] = [];
  const order: string[] = [];

  const deps: CompanyWebResearchDeps = {
    async resolveCompanyDomain(company) {
      domainCalls.push(company);
      order.push("domain");
      if (typeof opts.domainResolution === "function") return opts.domainResolution();
      return opts.domainResolution ?? confirmedResolution();
    },
    async researchCompanyBusiness(request) {
      businessCalls.push(request);
      order.push("business");
      if (typeof opts.businessResearch === "function") return opts.businessResearch();
      return opts.businessResearch ?? completedBusiness();
    },
    assembleCompanyProfile(input, assemblyDeps) {
      assemblyCalls.push(input);
      order.push("assembly");
      if (opts.assembleCompanyProfileOverride !== undefined) return opts.assembleCompanyProfileOverride(input);
      if (opts.useRealAssembly !== false) return assembleCompanyProfile(input, assemblyDeps);
      if (opts.assemblyResult !== undefined) {
        // A canned stub result still stands in for a WELL-BEHAVED dependency
        // reading the tracked clock exactly once (the orchestrator's own
        // tracked-clock invariant is a separate concern from whatever this
        // test is targeting via the canned result).
        assemblyDeps.now();
        return opts.assemblyResult;
      }
      return {
        status: "legal_only",
        profile: assembleCompanyProfile(input, assemblyDeps).profile,
        sources: [],
        evidence: [],
        reasons: [],
      };
    },
    now: clock(),
  };

  return { deps, domainCalls, businessCalls, assemblyCalls, order };
}

function conflictResolution(): CompanyDomainResolutionResult {
  const candidate = {
    origin: ORIGIN,
    domain: DOMAIN,
    status: "probable" as const,
    score: 100,
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    signals: { matchedLegalName: null, matchedKrs: null, matchedNip: "5270000000", matchedRegon: null, matchedCity: null },
  };
  return {
    status: "conflict",
    confirmedOrigin: null,
    selectedCandidate: candidate,
    // The real `resolveCompanyDomain` always keeps the selected candidate as
    // (the sole) member of `evaluatedCandidates` — confirmation only decides
    // the CONFIRMATION outcome, never the discovery/evaluation shape.
    evaluatedCandidates: [candidate],
    confirmation: {
      status: "conflict",
      confirmedOrigin: null,
      verifiedIdentifiers: [],
      reasons: [],
      conflicts: ["NIP_CONFLICT"],
      sourceOrigins: [],
    },
    reasons: ["CONFIRMATION_CONFLICT"],
    sourceOrigins: [],
  };
}

// --- (1-6) status flow, using the REAL assembleCompanyProfile -----------------

test("(1) confirmed domain + completed business research → complete assembly", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.domainResolution.status, "confirmed");
  assert.equal(r.businessResearch.status, "completed");
  assert.equal(r.profileAssembly.status, "complete");
});

test("(2) confirmed domain + partial business research → partial assembly", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: partialBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.businessResearch.status, "partial");
  assert.equal(r.profileAssembly.status, "partial");
});

test("(3) confirmed domain + unverified business research → partial assembly (website confirmed only)", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: unverifiedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.businessResearch.status, "unverified");
  assert.equal(r.profileAssembly.status, "partial");
  assert.equal(r.profileAssembly.profile.website.verified, true);
});

test("(4) unverified domain → skipped business research → legal_only assembly", async () => {
  const h = harness({ domainResolution: unverifiedResolution(), businessResearch: skippedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.businessResearch.status, "skipped");
  assert.equal(r.profileAssembly.status, "legal_only");
  assert.equal(h.businessCalls.length, 1);
});

test("(5) conflict domain → skipped business research → legal_only assembly", async () => {
  const h = harness({ domainResolution: conflictResolution(), businessResearch: skippedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.domainResolution.status, "conflict");
  assert.equal(r.businessResearch.status, "skipped");
  assert.equal(r.profileAssembly.status, "legal_only");
});

test("(6) not_found domain → skipped business research → legal_only assembly", async () => {
  const h = harness({ domainResolution: notFoundResolution(), businessResearch: skippedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.domainResolution.status, "not_found");
  assert.equal(r.businessResearch.status, "skipped");
  assert.equal(r.profileAssembly.status, "legal_only");
});

// --- (7-9) exactly-once call counts -------------------------------------------

test("(7/8/9) every stage is called exactly once", async () => {
  const h = harness({});
  await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(h.domainCalls.length, 1);
  assert.equal(h.businessCalls.length, 1);
  assert.equal(h.assemblyCalls.length, 1);
});

// --- (10) exact call order -----------------------------------------------------

test("(10) stages run in exact order: domain → business → assembly", async () => {
  const h = harness({});
  await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.deepEqual(h.order, ["domain", "business", "assembly"]);
});

// --- (11) company passed through unmutated -------------------------------------

test("(11) the same KrsCompany is passed to every stage without mutation", async () => {
  const company = krsCompany();
  const before = JSON.parse(JSON.stringify(company));
  const h = harness({});
  await orchestrateCompanyWebResearch({ company }, h.deps);
  assert.equal(h.domainCalls[0], company);
  assert.equal(h.businessCalls[0].company, company);
  assert.equal(h.assemblyCalls[0].company, company);
  assert.deepEqual(company, before);
});

// --- (12) exact domain result reaches Business Research -----------------------
//
// NOTE (Part B hardening): the raw domain-resolution result is now shape-
// validated (`assertValidDomainResolutionResultShape`) BEFORE it is used for
// anything else — and that validator returns a FRESH object built field-by-
// field (never the original), specifically so an inherited/prototype-polluted
// value on the ORIGINAL stub-returned object can never survive. So Business
// Research necessarily receives a structurally-identical but NOT
// reference-identical value — this is a deliberate, security-required
// consequence of the shape-validation fix, not a regression.

test("(12) Business Research receives a value structurally identical to what resolveCompanyDomain returned", async () => {
  const domainResolution = confirmedResolution();
  const h = harness({ domainResolution });
  await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.deepEqual(h.businessCalls[0].domainResolution, domainResolution);
});

// --- (13) exact domain + business results reach Profile Assembly --------------

test("(13) Profile Assembly receives domain/business values structurally identical to the validated upstream results", async () => {
  const domainResolution = confirmedResolution();
  const businessResearch = completedBusiness();
  const h = harness({ domainResolution, businessResearch });
  await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.deepEqual(h.assemblyCalls[0].domainResolution, domainResolution);
  assert.deepEqual(h.assemblyCalls[0].businessResearch, businessResearch);
});

// --- (14) same AbortSignal reaches every applicable stage ----------------------

test("(14) the same AbortSignal reaches both network-capable stages", async () => {
  const controller = new AbortController();
  const seenSignals: Array<AbortSignal | undefined> = [];
  const deps: CompanyWebResearchDeps = {
    async resolveCompanyDomain(_company, options) {
      seenSignals.push(options?.signal);
      return confirmedResolution();
    },
    async researchCompanyBusiness(_request, options) {
      seenSignals.push(options?.signal);
      return completedBusiness();
    },
    assembleCompanyProfile: (input, d) => assembleCompanyProfile(input, d),
    now: clock(),
  };
  await orchestrateCompanyWebResearch({ company: krsCompany(), signal: controller.signal }, deps);
  assert.equal(seenSignals.length, 2);
  assert.equal(seenSignals[0], controller.signal);
  assert.equal(seenSignals[1], controller.signal);
});

// --- (15/16/17) error propagation stops the pipeline, EXACT instance identity --
//
// Part E: prove `receivedError === expectedError` for each stage — the exact
// SAME object, never a wrapped/translated copy — by constructing ONE error
// instance and having the stub throw exactly that instance.

test("(15) a Domain Resolution error is the exact thrown instance and stops the pipeline", async () => {
  const expectedError = new DomainDiscoveryTimeoutError();
  const h = harness({ domainResolution: () => { throw expectedError; } });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    (e: unknown) => e === expectedError,
  );
  assert.equal(h.businessCalls.length, 0);
  assert.equal(h.assemblyCalls.length, 0);
});

test("(16) a Business Research error is the exact thrown instance and stops the pipeline before Profile Assembly", async () => {
  const expectedError = new BusinessResearchInvariantError("boom");
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: () => { throw expectedError; },
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    (e: unknown) => e === expectedError,
  );
  assert.equal(h.assemblyCalls.length, 0);
});

test("(16b) assembly is never called when business research throws", async () => {
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: () => { throw new BusinessResearchInvariantError("boom"); },
  });
  let assemblyCalled = false;
  const deps: CompanyWebResearchDeps = {
    ...h.deps,
    assembleCompanyProfile(input, d) {
      assemblyCalled = true;
      return assembleCompanyProfile(input, d);
    },
  };
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, deps));
  assert.equal(assemblyCalled, false);
});

test("(17) a Profile Assembly error is the exact thrown instance and propagates unchanged", async () => {
  const expectedError = new ProfileAssemblyInvariantError("boom");
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
    useRealAssembly: false,
    assembleCompanyProfileOverride: () => { throw expectedError; },
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    (e: unknown) => e === expectedError,
  );
});

// --- (18) caller AbortError propagates unchanged, exact instance identity ------

test("(18) caller cancellation (AbortError) is the exact thrown instance and propagates unchanged", async () => {
  const abortError = new DOMException("aborted", "AbortError");
  const h = harness({ domainResolution: () => { throw abortError; } });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    (e: unknown) => e === abortError,
  );
});

test("(18b) caller cancellation from Business Research is the exact thrown instance", async () => {
  const abortError = new DOMException("aborted", "AbortError");
  const h = harness({
    domainResolution: confirmedResolution(),
    businessResearch: () => { throw abortError; },
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    (e: unknown) => e === abortError,
  );
});

// --- (19) inconsistent non-confirmed resolution + accepted facts throws --------

test("(19) a non-confirmed resolution with accepted business facts throws an invariant error", async () => {
  const h = harness({ domainResolution: unverifiedResolution(), businessResearch: completedBusiness() });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    CompanyWebResearchInvariantError,
  );
  assert.equal(h.assemblyCalls.length, 0);
});

// --- (20) researchedOrigin mismatch throws --------------------------------------

test("(20a) accepted business facts with a researchedOrigin that disagrees with the confirmed domain throws", async () => {
  const mismatched: StructuredBusinessResearchResult = {
    ...completedBusiness(),
    researchedOrigin: "https://not-the-confirmed-domain.example",
  };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: mismatched });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    CompanyWebResearchInvariantError,
  );
});

test("(20b) a skipped/unverified result carrying a non-null researchedOrigin throws (caught by business-research's own raw-shape validator)", async () => {
  const bogus: StructuredBusinessResearchResult = { ...skippedBusiness(), researchedOrigin: ORIGIN };
  const h = harness({ domainResolution: notFoundResolution(), businessResearch: bogus });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    BusinessResearchInvariantError,
  );
});

// --- (21) impossible completed assembly from skipped/unverified research -------

test("(21) a stub reporting 'complete' assembly despite skipped research throws (caught by the strict cross-stage consistency validator)", async () => {
  const h = harness({
    domainResolution: notFoundResolution(),
    businessResearch: skippedBusiness(),
    useRealAssembly: false,
    assemblyResult: {
      status: "complete",
      profile: assembleCompanyProfile(
        { company: krsCompany(), domainResolution: notFoundResolution(), businessResearch: skippedBusiness() },
        { now: clock() },
      ).profile,
      sources: [],
      evidence: [],
      reasons: [],
    },
  });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    ProfileAssemblyInvariantError,
  );
});

// --- (22) final privacy guard rejects a smuggled personal field ----------------

test("(22) a personal-data field smuggled in by a malformed Profile Assembly stub is rejected", async () => {
  // Bypass the REAL assembleCompanyProfile (which would already guard this
  // itself) with a malformed stub, so only THIS orchestrator's own final,
  // defense-in-depth privacy guard is what catches the leak.
  const domainResolution = confirmedResolution();
  const businessResearch = completedBusiness();
  const validProfile = assembleCompanyProfile(
    { company: krsCompany(), domainResolution, businessResearch },
    { now: clock() },
  ).profile;
  const taintedResult: CompanyProfileAssemblyResult = {
    status: "complete",
    profile: { ...validProfile, business: { ...validProfile.business, description: "Contact us at leak@example.com" } },
    sources: [],
    evidence: [],
    reasons: [],
  };
  const h = harness({ domainResolution, businessResearch, useRealAssembly: false, assemblyResult: taintedResult });
  // Part E: the privacy-guard error propagates unchanged — never wrapped into
  // `CompanyWebResearchInvariantError` or any other translated type.
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    PersonalDataLeakError,
  );
});

// --- (23) exact page URL injected by a malformed stub is rejected --------------

test("(23) an exact page URL injected by a malformed domain-resolution stub is rejected by the raw shape validator", async () => {
  // Part C: EVERY declared origin field is validated directly, including a
  // nested `evaluatedCandidates[*].sourceOrigins` entry — caught immediately by
  // domain-resolution's own raw-shape validator, before it ever reaches
  // Profile Assembly or the defense-in-depth recursive scan.
  const base = unverifiedResolution();
  const tainted: CompanyDomainResolutionResult = {
    ...base,
    evaluatedCandidates: [
      { ...base.evaluatedCandidates[0], sourceOrigins: ["https://przyklad.example/kontakt?ref=1"] },
    ],
  };
  const h = harness({ domainResolution: tainted, businessResearch: skippedBusiness() });
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps),
    DomainResolutionInvariantError,
  );
  assert.equal(h.businessCalls.length, 0);
});

// --- (24) person-like legal company name remains accepted ----------------------

test("(24) a person-like official legal company name is accepted end-to-end", async () => {
  const company = krsCompany({ legalName: "Jan Kowalski Consulting Sp. z o.o." });
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company }, h.deps);
  assert.equal(r.profileAssembly.profile.identity.legalName, "Jan Kowalski Consulting Sp. z o.o.");
  assert.doesNotThrow(() => assertNoPersonalData(r.profileAssembly.profile, "company"));
});

// --- (25) no direct network/OpenAI/provider/budget/environment access ----------

test("(25) the orchestrator module touches no network/OpenAI/provider/budget/environment API", () => {
  const path = fileURLToPath(new URL("../web-research/orchestrateCompanyWebResearch.ts", import.meta.url));
  // Strip comments first: the module's own doc-comments legitimately name what
  // it does NOT do (e.g. "creates NO OpenAI client") — only the executable code
  // must avoid these tokens.
  const source = readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const forbidden of ["fetch(", "openai", "OpenAI", "process.env", "Budget", "Provider", "new URL(", "http."]) {
    assert.ok(!source.includes(forbidden), `unexpected "${forbidden}" in the orchestrator module's code`);
  }
});

// --- (26/27) detachment ---------------------------------------------------------

test("(26) the result is deeply detached from the stub's returned objects", async () => {
  const domainResolution = confirmedResolution();
  const businessResearch = completedBusiness();
  const h = harness({ domainResolution, businessResearch });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);

  assert.notEqual(r.domainResolution, domainResolution);
  assert.notEqual(r.businessResearch, businessResearch);
  assert.deepEqual(r.domainResolution, domainResolution);
  assert.deepEqual(r.businessResearch, businessResearch);

  r.domainResolution.evaluatedCandidates.push({ ...r.domainResolution.evaluatedCandidates[0] });
  r.domainResolution.sourceOrigins.push("https://injected.example");
  r.businessResearch.sources.push({ ...r.businessResearch.sources[0] });
  r.businessResearch.facts.productsServices.push("INJECTED");

  assert.equal(domainResolution.evaluatedCandidates.length, 1);
  assert.equal(domainResolution.sourceOrigins.length, 1);
  assert.equal(businessResearch.sources.length, completedBusiness().sources.length);
  assert.ok(!businessResearch.facts.productsServices.includes("INJECTED"));
});

test("(27) mutating one returned section does not mutate a sibling section", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);

  const beforeBusinessSources = r.businessResearch.sources.length;
  const beforeAssemblySources = r.profileAssembly.sources.length;
  const beforeProfileProducts = [...r.profileAssembly.profile.business.productsServices];

  r.domainResolution.sourceOrigins.push("https://injected.example");
  r.domainResolution.reasons.push("MULTIPLE_PROBABLE_CANDIDATES");

  assert.equal(r.businessResearch.sources.length, beforeBusinessSources);
  assert.equal(r.profileAssembly.sources.length, beforeAssemblySources);
  assert.deepEqual(r.profileAssembly.profile.business.productsServices, beforeProfileProducts);

  r.businessResearch.facts.productsServices.push("INJECTED");
  assert.deepEqual(r.profileAssembly.profile.business.productsServices, beforeProfileProducts);
});

// --- (28) deterministic repeated execution --------------------------------------

test("(28) repeated execution with semantically identical deps yields semantically identical output", async () => {
  const h1 = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const h2 = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r1 = await orchestrateCompanyWebResearch({ company: krsCompany() }, h1.deps);
  const r2 = await orchestrateCompanyWebResearch({ company: krsCompany() }, h2.deps);
  assert.deepEqual(r1, r2);
});

// --- KRS-input validation (step 1 of the pipeline) ------------------------------

test("an invalid sanitized KrsCompany is rejected before any stage runs", async () => {
  const invalid = { ...krsCompany(), krs: "123" } as KrsCompany;
  const h = harness({});
  await assert.rejects(
    () => orchestrateCompanyWebResearch({ company: invalid }, h.deps),
    ProfileAssemblyInvariantError,
  );
  assert.equal(h.domainCalls.length, 0);
  assert.equal(h.businessCalls.length, 0);
  assert.equal(h.assemblyCalls.length, 0);
});

// --- result shape sanity ---------------------------------------------------------

test("the returned wrapper carries exactly the three internal sections", async () => {
  const h = harness({});
  const r: CompanyWebResearchResult = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.deepEqual(Object.keys(r).sort(), ["businessResearch", "domainResolution", "profileAssembly"]);
});

// ============================================================================
// Part F — privacy-path correctness (validation now runs BEFORE cloning)
// ============================================================================

test("(F1) an email in an otherwise-allowed business fact field is rejected (not merely an unknown key)", async () => {
  const tainted: StructuredBusinessResearchResult = {
    ...completedBusiness(),
    facts: { ...completedBusiness().facts, operatingMarkets: ["Kontakt: jan.kowalski@example.com"] },
  };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps));
});

test("(F2) a phone number in an otherwise-allowed business fact field is rejected", async () => {
  const tainted: StructuredBusinessResearchResult = {
    ...completedBusiness(),
    facts: { ...completedBusiness().facts, industryDescription: "Zadzwon: +48 123 456 789" },
  };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps));
});

test("(F3) a role+name phrase in an otherwise-allowed business fact field is rejected", async () => {
  const tainted: StructuredBusinessResearchResult = {
    ...completedBusiness(),
    facts: { ...completedBusiness().facts, industryDescription: "Kontakt: Anna Nowak" },
  };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps));
});

test("(F4) a personal social-profile URL text in an otherwise-allowed field is rejected", async () => {
  const tainted: StructuredBusinessResearchResult = {
    ...completedBusiness(),
    facts: { ...completedBusiness().facts, industryDescription: "Zobacz linkedin.com/in/jankowalski" },
  };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps));
});

test("(F5) a contactPerson/owner/founder/employee-style KEY anywhere is rejected as an unexpected field (strict shape), even with a clean value", async () => {
  for (const key of ["contactPerson", "owner", "founder", "employee"]) {
    const tainted = { ...completedBusiness(), [key]: "Jan Kowalski" };
    const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted as unknown as StructuredBusinessResearchResult });
    await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps));
  }
});

test("(F6) an unknown but non-personal-looking field still fails strict shape validation", async () => {
  const tainted = { ...completedBusiness(), weatherForecast: "sunny" };
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: tainted as unknown as StructuredBusinessResearchResult });
  await assert.rejects(() => orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps));
});

test("(F7) a person-like official legal company name still passes through the raw (pre-clone) privacy guard", async () => {
  const company = krsCompany({ legalName: "Anna Nowak Doradztwo Sp. z o.o." });
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company }, h.deps);
  assert.equal(r.profileAssembly.profile.identity.legalName, "Anna Nowak Doradztwo Sp. z o.o.");
});

// ============================================================================
// Part G — expanded mutation-isolation (detachment) coverage
// ============================================================================

test("(G1) mutating the supplied company does not affect the returned profile, and vice versa", async () => {
  const company = krsCompany();
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company }, h.deps);

  const beforeLegalName = r.profileAssembly.profile.identity.legalName;
  (company as { legalName: string }).legalName = "MUTATED";
  assert.equal(r.profileAssembly.profile.identity.legalName, beforeLegalName);

  r.profileAssembly.profile.identity.aliases.push("INJECTED");
  assert.deepEqual(company.pkdSecondaryCodes, krsCompany().pkdSecondaryCodes);
});

test("(G2) mutating domainResolution does not affect profileAssembly, and vice versa", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);

  const beforeWebsiteUrl = r.profileAssembly.profile.website.url;
  r.domainResolution.evaluatedCandidates[0].signals.matchedNip = "MUTATED";
  r.domainResolution.selectedCandidate!.sourceOrigins.push("https://injected.example");
  assert.equal(r.profileAssembly.profile.website.url, beforeWebsiteUrl);

  const beforeConfirmedOrigin = r.domainResolution.confirmedOrigin;
  r.profileAssembly.sources.forEach((s) => void s); // sources are separate objects
  assert.equal(r.domainResolution.confirmedOrigin, beforeConfirmedOrigin);
});

test("(G3) mutating businessResearch sources/evidence does not affect profileAssembly sources/evidence, and vice versa", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);

  const beforeAssemblySourceCount = r.profileAssembly.sources.length;
  const beforeAssemblyEvidenceCount = r.profileAssembly.evidence.length;
  r.businessResearch.sources.push({ ...r.businessResearch.sources[0], id: "src_injected" });
  r.businessResearch.evidence.push({ ...r.businessResearch.evidence[0], id: "fev_injected" });
  assert.equal(r.profileAssembly.sources.length, beforeAssemblySourceCount);
  assert.equal(r.profileAssembly.evidence.length, beforeAssemblyEvidenceCount);

  const beforeBusinessSourceCount = r.businessResearch.sources.length;
  r.profileAssembly.sources.push({ ...r.profileAssembly.sources[0], id: "src_injected_2" });
  assert.equal(r.businessResearch.sources.length, beforeBusinessSourceCount);
});

test("(G4) mutating a nested evidence.sourceIds array does not affect a sibling evidence record", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.ok(r.profileAssembly.evidence.length >= 2);

  const before = [...r.profileAssembly.evidence[1].sourceIds];
  r.profileAssembly.evidence[0].sourceIds.push("src_injected");
  assert.deepEqual(r.profileAssembly.evidence[1].sourceIds, before);
});

test("(G5) mutating a nested candidate signals object does not affect a sibling candidate", async () => {
  const h = harness({
    domainResolution: {
      ...confirmedResolution(),
      evaluatedCandidates: [confirmedResolution().evaluatedCandidates[0], { ...confirmedResolution().evaluatedCandidates[0], origin: "https://other.example", domain: "other.example", status: "unverified" }],
    },
    businessResearch: completedBusiness(),
  });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);
  assert.equal(r.domainResolution.evaluatedCandidates.length, 2);

  const beforeNip = r.domainResolution.evaluatedCandidates[1].signals.matchedNip;
  r.domainResolution.evaluatedCandidates[0].signals.matchedNip = "MUTATED";
  assert.equal(r.domainResolution.evaluatedCandidates[1].signals.matchedNip, beforeNip);
});

test("(G6) mutating businessResearch.facts arrays does not affect the profile's business arrays", async () => {
  const h = harness({ domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  const r = await orchestrateCompanyWebResearch({ company: krsCompany() }, h.deps);

  const before = [...r.profileAssembly.profile.business.customerSegments];
  r.businessResearch.facts.customerSegments.push("INJECTED");
  r.businessResearch.facts.operatingMarkets.push("INJECTED");
  assert.deepEqual(r.profileAssembly.profile.business.customerSegments, before);
});
