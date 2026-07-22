import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { ProfileAssemblyInvariantError } from "../profile-assembly/errors.ts";
import { PRODUCTS_SERVICES_PATH } from "../business-research/buildBusinessEvidence.ts";
import { businessEvidenceId, businessItemId, businessSourceId } from "../business-research/ids.ts";
import { canonicalKey } from "../business-research/normalizeBusinessFacts.ts";
import {
  AT,
  clock,
  CLOCK_AT,
  completedBusiness,
  completedBusinessAtSourceOrigin,
  confirmedResolution,
  DOMAIN,
  industryOnlyBusiness,
  krsCompany,
  notFoundResolution,
  ORIGIN,
  productsOnlyBusiness,
  skippedBusiness,
  unverifiedBusiness,
} from "./profileAssemblyFixtures.ts";
import type { StructuredBusinessResearchResult } from "../business-research/types.ts";
import type { CompanyProfileAssemblyInput } from "../profile-assembly/types.ts";
import type { KrsCompany } from "../types.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";

function assemble(input: CompanyProfileAssemblyInput) {
  return assembleCompanyProfile(input, { now: clock() });
}

function confirmedInput(business: StructuredBusinessResearchResult): CompanyProfileAssemblyInput {
  return { company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: business };
}

// ---------------------------------------------------------------------------
// A. Every accepted Business Research source is fully validated.
// ---------------------------------------------------------------------------
const sourceMutations: Array<[string, (b: StructuredBusinessResearchResult) => void]> = [
  ["exact page path + query", (b) => { b.sources[0].url = "https://przyklad.example/path?query=1"; }],
  ["off-domain origin", (b) => {
    b.sources[0].url = "https://off.example";
    b.sources[0].domain = "off.example";
    b.sources[0].id = businessSourceId("https://off.example");
  }],
  ["mismatched domain field", (b) => { b.sources[0].domain = "wrong.example"; }],
  ["wrong provider", (b) => { b.sources[0].provider = "krs"; }],
  ["wrong type", (b) => { b.sources[0].type = "government"; }],
  ["wrong authority", (b) => { b.sources[0].authority = "secondary"; }],
  ["website id with a different url", (b) => { b.sources[0].url = "https://www.przyklad.example"; }],
  ["id inconsistent with url", (b) => { b.sources[0].id = "src_web_bogus"; }],
  ["invalid retrievedAt", (b) => { b.sources[0].retrievedAt = "not-a-date"; }],
];
for (const [name, mutate] of sourceMutations) {
  test(`A: malformed business source (${name}) throws`, () => {
    const business = completedBusiness();
    mutate(business);
    assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
  });
}

// ---------------------------------------------------------------------------
// B. FactEvidence.sourceIds must be non-empty and unique.
// ---------------------------------------------------------------------------
test("B: accepted business evidence with empty sourceIds throws", () => {
  const business = completedBusiness();
  business.evidence[0].sourceIds = [];
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("B: accepted business evidence with duplicate sourceIds throws", () => {
  const business = completedBusiness();
  const id = business.sources[0].id;
  business.evidence[0].sourceIds = [id, id];
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("B: every merged evidence record has non-empty, unique sourceIds", () => {
  const r = assemble(confirmedInput(completedBusiness()));
  for (const e of r.evidence) {
    assert.ok(e.sourceIds.length >= 1);
    assert.equal(new Set(e.sourceIds).size, e.sourceIds.length);
  }
});

// ---------------------------------------------------------------------------
// C. Business status must agree with category completeness.
// ---------------------------------------------------------------------------
test("C: partial facts relabelled completed throws", () => {
  const business = completedBusiness({ customerSegments: [] }); // really partial
  business.status = "completed";
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("C: all four categories relabelled partial throws", () => {
  const business = completedBusiness();
  business.status = "partial";
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("C: completed with an empty productsServices throws", () => {
  const business = completedBusiness();
  business.facts.productsServices = [];
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("C: partial with no material facts throws", () => {
  const business = completedBusiness();
  business.status = "partial";
  business.facts = { industryDescription: null, productsServices: [], customerSegments: [], operatingMarkets: [] };
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

// ---------------------------------------------------------------------------
// D. Canonical list ordering makes the whole result order-independent.
// ---------------------------------------------------------------------------
test("D: reversing upstream list facts yields a semantically identical result", () => {
  const a = assemble(confirmedInput(completedBusiness()));
  const reversed = completedBusiness();
  reversed.facts.productsServices.reverse();
  reversed.facts.customerSegments.reverse();
  reversed.facts.operatingMarkets.reverse();
  const b = assemble(confirmedInput(reversed));
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// E. The 600-char description limit is a hard boundary.
// ---------------------------------------------------------------------------
test("E: an identity clause longer than 600 omits the whole description", () => {
  const company = krsCompany({ legalName: `${"Alfa Beta ".repeat(70)}Sp. z o.o.` });
  const r = assemble({ company, domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  assert.equal(r.profile.business.description, undefined);
  assert.ok(!r.evidence.some((e) => e.target.path === "company.business.description"));
  assert.ok(r.reasons.includes("DESCRIPTION_OMITTED"));
});

test("E: no assembled description ever exceeds 600 characters", () => {
  const company = krsCompany({ legalName: `${"Nazwa ".repeat(40)}Sp. z o.o.` });
  const r = assemble({ company, domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  if (r.profile.business.description !== undefined) {
    assert.ok(r.profile.business.description.length <= 600);
  }
});

// ---------------------------------------------------------------------------
// F. Website evidence derivation is "normalized".
// ---------------------------------------------------------------------------
test("F: website evidence uses the normalized derivation", () => {
  const r = assemble(confirmedInput(unverifiedBusiness()));
  const web = r.evidence.find((e) => e.target.path === "company.website.url");
  assert.ok(web);
  assert.equal(web?.derivation, "normalized");
  for (const bad of ["extracted", "registry", "synthesized", "derived"]) {
    assert.notEqual(web?.derivation, bad);
  }
});

// Description evidence derivation stays "derived" (unchanged).
test("F: description evidence derivation stays derived", () => {
  const r = assemble(confirmedInput(completedBusiness()));
  const desc = r.evidence.find((e) => e.target.path === "company.business.description");
  assert.equal(desc?.derivation, "derived");
});

// ---------------------------------------------------------------------------
// G. The complete KrsCompany runtime shape is validated before the mappers.
// ---------------------------------------------------------------------------
const krsMutations: Array<[string, Partial<Record<keyof KrsCompany, unknown>>]> = [
  ["malformed retrievedAt", { retrievedAt: "not-a-date" }],
  ["pkdSecondaryCodes not an array", { pkdSecondaryCodes: "62.01.Z" }],
  ["pkdLabels not an array", { pkdLabels: 5 }],
  ["invalid item in pkdSecondaryCodes", { pkdSecondaryCodes: [123] }],
  ["invalid nip type", { nip: 5270000000 }],
  ["malformed registrationDate type", { registrationDate: 20110315 }],
  ["empty legalName", { legalName: "   " }],
  ["non-10-digit krs", { krs: "123" }],
];
for (const [name, override] of krsMutations) {
  test(`G: malformed KRS field (${name}) throws ProfileAssemblyInvariantError`, () => {
    const company = krsCompany(override as Partial<KrsCompany>);
    assert.throws(
      () => assemble({ company, domainResolution: notFoundResolution(), businessResearch: skippedBusiness() }),
      ProfileAssemblyInvariantError,
    );
  });
}

test("G: a valid minimal KrsCompany still succeeds", () => {
  const minimal = krsCompany({
    nip: undefined,
    regon: undefined,
    legalForm: undefined,
    registrationDate: undefined,
    city: undefined,
    region: undefined,
    pkdPrimaryCode: undefined,
    registerType: undefined,
    pkdSecondaryCodes: [],
    pkdLabels: [],
  });
  const r = assemble({ company: minimal, domainResolution: notFoundResolution(), businessResearch: skippedBusiness() });
  assert.equal(r.status, "legal_only");
  assert.equal(r.profile.identity.legalName, minimal.legalName);
});

// ---------------------------------------------------------------------------
// A (extra). ISO datetime + subdomain + publishedAt through the real assembler.
// ---------------------------------------------------------------------------
const krsTimestampCases: Array<[string, string]> = [
  ["date-only", "2026-07-17"],
  ["locale date", "July 17, 2026"],
  ["no timezone", "2026-07-17T12:30:00"],
  ["bare offset (not contract-supported)", "2026-07-17T12:30:00+02:00"],
  ["impossible calendar date", "2026-13-40T00:00:00.000Z"],
];
for (const [name, value] of krsTimestampCases) {
  test(`A: KRS retrievedAt (${name}) throws`, () => {
    const company = krsCompany({ retrievedAt: value });
    assert.throws(
      () => assemble({ company, domainResolution: notFoundResolution(), businessResearch: skippedBusiness() }),
      ProfileAssemblyInvariantError,
    );
  });
}

test("A: a valid canonical UTC ISO datetime succeeds", () => {
  const company = krsCompany({ retrievedAt: "2026-07-17T12:30:00.000Z" });
  const r = assemble({ company, domainResolution: notFoundResolution(), businessResearch: skippedBusiness() });
  assert.equal(r.status, "legal_only");
});

const businessTimestampCases: Array<[string, (b: StructuredBusinessResearchResult) => void]> = [
  ["retrievedAt date-only", (b) => { b.sources[0].retrievedAt = "2026-07-17"; }],
  ["retrievedAt no timezone", (b) => { b.sources[0].retrievedAt = "2026-07-17T12:30:00"; }],
  ["publishedAt locale date", (b) => { b.sources[0].publishedAt = "July 17, 2026"; }],
  ["publishedAt no timezone", (b) => { b.sources[0].publishedAt = "2026-07-17T12:30:00"; }],
];
for (const [name, mutate] of businessTimestampCases) {
  test(`A: business source ${name} throws`, () => {
    const business = completedBusiness();
    mutate(business);
    assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
  });
}

test("A: arbitrary subdomain business source throws", () => {
  // A fully self-consistent source (url/domain/id) on an arbitrary subdomain must
  // still be rejected — only the apex host and its exact www counterpart pass.
  const sub = "https://sub.przyklad.example";
  const business = completedBusiness();
  business.sources[0].url = sub;
  business.sources[0].domain = "sub.przyklad.example";
  business.sources[0].id = businessSourceId(sub);
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

// ---------------------------------------------------------------------------
// B (extra). Complete StructuredBusinessFacts runtime shape via the assembler.
// ---------------------------------------------------------------------------
const factShapeCases: Array<[string, (b: StructuredBusinessResearchResult) => void]> = [
  ["whitespace-only industryDescription", (b) => { b.facts.industryDescription = "   "; }],
  ["whitespace-only productsServices item", (b) => { b.facts.productsServices = ["   "]; }],
  ["tab-only customerSegments item", (b) => { b.facts.customerSegments = ["\t"]; }],
  ["newline-only operatingMarkets item", (b) => { b.facts.operatingMarkets = ["\n"]; }],
  ["non-string list item", (b) => { (b.facts.productsServices as unknown[])[0] = 123; }],
  ["productsServices as a string", (b) => { (b.facts as unknown as Record<string, unknown>).productsServices = "Meble"; }],
  ["customerSegments as null", (b) => { (b.facts as unknown as Record<string, unknown>).customerSegments = null; }],
  ["missing operatingMarkets", (b) => { delete (b.facts as unknown as Record<string, unknown>).operatingMarkets; }],
  ["facts is null", (b) => { (b as unknown as Record<string, unknown>).facts = null; }],
  ["non-normalized (padded) item", (b) => { b.facts.productsServices = ["  Meble  "]; }],
];
for (const [name, mutate] of factShapeCases) {
  test(`B: malformed business facts (${name}) throws`, () => {
    const business = completedBusiness();
    mutate(business);
    assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
  });
}

test("B: valid normalized completed facts succeed", () => {
  const r = assemble(confirmedInput(completedBusiness()));
  assert.equal(r.status, "complete");
});

test("B: valid normalized minimal partial facts succeed", () => {
  const r = assemble(confirmedInput(industryOnlyBusiness("Usługi IT")));
  assert.equal(r.status, "partial");
  assert.equal(r.profile.industry.description, "Usługi IT");
});

// ---------------------------------------------------------------------------
// C (extra). Canonical-duplicate business facts are rejected per category.
// ---------------------------------------------------------------------------
const duplicateCases: Array<[string, (b: StructuredBusinessResearchResult) => void]> = [
  ["case-variant products", (b) => { b.facts.productsServices = ["Meble", "meble"]; }],
  ["duplicate customer segments", (b) => { b.facts.customerSegments = ["MŚP", "mśp"]; }],
  ["duplicate operating markets", (b) => { b.facts.operatingMarkets = ["Polska", "POLSKA"]; }],
];
for (const [name, mutate] of duplicateCases) {
  test(`C: canonical-duplicate facts (${name}) throw`, () => {
    const business = completedBusiness();
    mutate(business);
    assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
  });
}

test("C: a spacing-variant duplicate is rejected (not repaired) as non-normalized", () => {
  const business = completedBusiness();
  business.facts.productsServices = ["Meble", "  meble  "]; // spacing variant not normalized
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("C: genuinely distinct + diacritic-distinct facts succeed and map 1:1 to evidence", () => {
  const business = completedBusiness({ productsServices: ["Cafe", "Café", "Meble"] });
  const r = assemble(confirmedInput(business));
  // canonicalKey preserves diacritics, so Cafe/Café stay distinct (3 items).
  assert.deepEqual(r.profile.business.productsServices, ["Cafe", "Café", "Meble"]);
  const productEvidence = r.evidence.filter((e) => e.target.path === "company.business.productsServices");
  assert.equal(productEvidence.length, 3); // one evidence target per retained fact
});

// ---------------------------------------------------------------------------
// D2. Website source reuse / exact confirmed-origin selection.
// ---------------------------------------------------------------------------
test("D2: a source with the confirmed id but a different url throws", () => {
  const business = completedBusiness();
  // Keep the confirmed-origin id, change the url to another valid on-domain origin.
  business.sources[0].url = "https://www.przyklad.example";
  business.sources[0].domain = "www.przyklad.example";
  // id still equals businessSourceId(ORIGIN) → inconsistent with the new url.
  assert.throws(() => assemble(confirmedInput(business)), ProfileAssemblyInvariantError);
});

test("D2: a valid www-counterpart source is not reused as the confirmed-origin source", () => {
  const business = completedBusinessAtSourceOrigin("https://www.przyklad.example");
  const r = assemble(confirmedInput(business));
  const websiteSources = r.sources.filter((s) => s.type === "official_company_website");
  // Both the www business source and a freshly created apex website source exist.
  assert.equal(websiteSources.length, 2);
  const apexId = businessSourceId(ORIGIN);
  const apex = websiteSources.find((s) => s.id === apexId);
  assert.ok(apex, "the exact confirmed-origin (apex) source must exist");
  assert.equal(apex?.url, ORIGIN);
  assert.equal(apex?.domain, DOMAIN);
  // Website evidence references ONLY the exact confirmed-origin source.
  const web = r.evidence.find((e) => e.target.path === "company.website.url");
  assert.deepEqual(web?.sourceIds, [apexId]);
});

test("D2: the confirmed-origin business source is reused (single website source)", () => {
  const r = assemble(confirmedInput(completedBusinessAtSourceOrigin(ORIGIN)));
  const websiteSources = r.sources.filter((s) => s.type === "official_company_website");
  assert.equal(websiteSources.length, 1);
  assert.equal(websiteSources[0].url, ORIGIN);
  const web = r.evidence.find((e) => e.target.path === "company.website.url");
  assert.deepEqual(web?.sourceIds, [businessSourceId(ORIGIN)]);
});

// ---------------------------------------------------------------------------
// D4. Exact 599 / 600 / 601 description boundary through the assembler.
//     description = `${legalName} — X.` → length = legalName.length + 5.
// ---------------------------------------------------------------------------
function assembleWithLegalName(len: number) {
  const company = krsCompany({ legalName: "A".repeat(len) });
  return assemble({ company, domainResolution: confirmedResolution(), businessResearch: industryOnlyBusiness("X") });
}

test("D4: final description length 599 is valid", () => {
  const r = assembleWithLegalName(594);
  assert.equal(r.profile.business.description?.length, 599);
});

test("D4: final description length 600 is valid", () => {
  const r = assembleWithLegalName(595);
  assert.equal(r.profile.business.description?.length, 600);
});

test("D4: a would-be 601 description is omitted whole (no partial clause)", () => {
  const r = assembleWithLegalName(596);
  assert.equal(r.profile.business.description, undefined);
  assert.ok(!r.evidence.some((e) => e.target.path === "company.business.description"));
  assert.ok(r.reasons.includes("DESCRIPTION_OMITTED"));
});

test("D4: a later oversized clause is dropped; earlier clauses kept ≤600", () => {
  // Deterministic clause math: identity(201) + " " + products(384) = 586 ≤ 600;
  // adding the markets clause (101) would reach 688 > 600, so markets is dropped
  // whole. No industry/segments → two candidate clauses after identity.
  const business = completedBusiness({
    industryDescription: null,
    productsServices: ["P".repeat(120), "Q".repeat(120), "R".repeat(120)],
    customerSegments: [],
    operatingMarkets: ["M".repeat(80)],
  });
  const r = assemble({
    company: krsCompany({ legalName: "A".repeat(200) }),
    domainResolution: confirmedResolution(),
    businessResearch: business,
  });
  const desc = r.profile.business.description;
  assert.ok(desc);
  assert.ok(desc!.length <= 600);
  assert.ok(desc!.includes("Produkty i usługi:"));
  assert.ok(!desc!.includes("Rynki działalności")); // the overflowing markets clause is dropped
  assert.ok(!desc!.includes("M".repeat(80)));
  assert.ok(desc!.endsWith("."));
  // The dropped category's business evidence still exists (only the description
  // omits it); the description itself renders only the kept facts.
  assert.ok(r.evidence.some((e) => e.target.path === "company.business.operatingMarkets"));
});

// ===========================================================================
// A (clock). The injected assembly clock is guarded at its dependency boundary.
// ===========================================================================
const malformedClocks: Array<[string, () => Date]> = [
  ["Invalid Date", () => new Date("invalid")],
  ["string via cast", (() => "2026-07-18T12:00:00.000Z") as unknown as () => Date],
  ["null via cast", (() => null) as unknown as () => Date],
  ["number via cast", (() => 123) as unknown as () => Date],
  ["undefined via cast", (() => undefined) as unknown as () => Date],
];
for (const [name, now] of malformedClocks) {
  test(`A: malformed clock (${name}) throws exactly ProfileAssemblyInvariantError`, () => {
    let caught: unknown;
    try {
      assembleCompanyProfile(confirmedInput(completedBusiness()), { now });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof ProfileAssemblyInvariantError);
    // No raw runtime error escapes.
    assert.ok(!(caught instanceof RangeError));
    assert.ok(!(caught instanceof TypeError));
  });
}

// A clock (or hostile Date method) that THROWS is translated to a generic error;
// the original message/name/value never leaks.
class GetTimeThrowingDate extends Date {
  override getTime(): number {
    throw new TypeError("hidden getTime detail");
  }
}
class IsoThrowingDate extends Date {
  override toISOString(): string {
    throw new RangeError("hidden toISOString detail");
  }
}

const throwingClocks: Array<[string, () => Date, string]> = [
  ["now() throws TypeError", () => { throw new TypeError("sensitive message"); }, "sensitive message"],
  ["now() throws RangeError", () => { throw new RangeError("private timestamp detail"); }, "private timestamp detail"],
  ["now() throws a non-Error value", () => { throw "secret value"; }, "secret value"],
  ["getTime() throws", () => new GetTimeThrowingDate(), "hidden getTime detail"],
  // getTime() stays finite (inherited), only toISOString() throws.
  ["toISOString() throws", () => new IsoThrowingDate(CLOCK_AT), "hidden toISOString detail"],
];
for (const [name, now, secret] of throwingClocks) {
  test(`A: throwing clock (${name}) → generic ProfileAssemblyInvariantError, no leak`, () => {
    let caught: unknown;
    let result: unknown;
    try {
      result = assembleCompanyProfile(confirmedInput(completedBusiness()), { now });
    } catch (e) {
      caught = e;
    }
    assert.equal(result, undefined); // no result produced
    assert.ok(caught instanceof ProfileAssemblyInvariantError);
    assert.ok(!(caught instanceof RangeError));
    assert.ok(!(caught instanceof TypeError));
    const err = caught as ProfileAssemblyInvariantError;
    assert.ok(!err.message.includes(secret)); // original detail never leaks
    assert.equal(err.message, "Profile assembly invariant violated: assembly clock failed");
    // No original exception is forwarded as a cause.
    assert.equal(err.cause, undefined);
  });
}

test("A: a valid clock is called exactly once and yields the expected UTC ISO", () => {
  let calls = 0;
  const now = (): Date => {
    calls += 1;
    return new Date(CLOCK_AT);
  };
  const r = assembleCompanyProfile(confirmedInput(unverifiedBusiness()), { now });
  assert.equal(calls, 1);
  const web = r.sources.find((s) => s.type === "official_company_website");
  assert.equal(web?.retrievedAt, CLOCK_AT);
});

test("A: all assembly-created timestamps share the single validated clock value", () => {
  // www business source → the confirmed apex website source is newly created, so
  // its retrievedAt, the website evidence verifiedAt and the description evidence
  // verifiedAt are all assembly-created and must equal the one clock value.
  let calls = 0;
  const now = (): Date => {
    calls += 1;
    return new Date(CLOCK_AT);
  };
  const business = completedBusinessAtSourceOrigin("https://www.przyklad.example");
  const r = assembleCompanyProfile(confirmedInput(business), { now });
  assert.equal(calls, 1);
  const apex = r.sources.find((s) => s.id === businessSourceId(ORIGIN));
  const web = r.evidence.find((e) => e.target.path === "company.website.url");
  const desc = r.evidence.find((e) => e.target.path === "company.business.description");
  assert.equal(apex?.retrievedAt, CLOCK_AT);
  assert.equal(web?.verifiedAt, CLOCK_AT);
  assert.equal(desc?.verifiedAt, CLOCK_AT);
  // Persisted upstream timestamps are unchanged — ONLY assembly-created records
  // use assembledAt. Both the KRS source and the persisted Business Research www
  // source keep their original upstream timestamp (AT).
  assert.equal(r.sources.find((s) => s.provider === "krs")?.retrievedAt, AT);
  const wwwSource = r.sources.find((s) => s.id === businessSourceId("https://www.przyklad.example"));
  assert.ok(wwwSource, "the persisted www business source is present");
  assert.equal(wwwSource?.retrievedAt, AT);
});

// ===========================================================================
// B1. Identical text across categories is allowed (dedup is category-local).
// ===========================================================================
test("B1: identical text in two categories is accepted with distinct evidence", () => {
  const business = completedBusiness({
    productsServices: ["Platformy B2B", "Meble"],
    customerSegments: ["Platformy B2B", "Handel"],
  });
  const r = assemble(confirmedInput(business));
  assert.ok(r.profile.business.productsServices.includes("Platformy B2B"));
  assert.ok(r.profile.business.customerSegments.includes("Platformy B2B"));
  const productEv = r.evidence.find(
    (e) =>
      e.target.path === "company.business.productsServices" &&
      e.target.itemId === businessItemId("company.business.productsServices", canonicalKey("Platformy B2B")),
  );
  const segmentEv = r.evidence.find(
    (e) =>
      e.target.path === "company.business.customerSegments" &&
      e.target.itemId === businessItemId("company.business.customerSegments", canonicalKey("Platformy B2B")),
  );
  assert.ok(productEv, "product-side evidence at its own target");
  assert.ok(segmentEv, "segment-side evidence at its own target");
  assert.notEqual(productEv?.id, segmentEv?.id); // distinct evidence records, no collision
  const ids = r.evidence.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length); // no evidence-id collision
});

// ===========================================================================
// B2. Description evidence excludes sources supporting only omitted facts.
// ===========================================================================
/**
 * A partial business result whose FOUR products are backed by DIFFERENT sources:
 * the three that sort first (Alpha/Beta/Gamma) by the confirmed-origin source, and
 * the omitted fourth (Zeta) by a distinct www source only. Renders 3 by the limit.
 */
function splitSourceProductsBusiness(): StructuredBusinessResearchResult {
  const www = "https://www.przyklad.example";
  const srcApex: ResearchSource = {
    id: businessSourceId(ORIGIN),
    provider: "openai_web_search",
    type: "official_company_website",
    authority: "primary",
    url: ORIGIN,
    domain: DOMAIN,
    retrievedAt: AT,
    publishedAt: null,
  };
  const srcWww: ResearchSource = {
    id: businessSourceId(www),
    provider: "openai_web_search",
    type: "official_company_website",
    authority: "primary",
    url: www,
    domain: "www.przyklad.example",
    retrievedAt: AT,
    publishedAt: null,
  };
  const P = PRODUCTS_SERVICES_PATH;
  const ev = (value: string, sourceIds: string[]): FactEvidence => {
    const itemId = businessItemId(P, canonicalKey(value));
    return {
      id: businessEvidenceId(P, itemId),
      target: { path: P, itemId },
      sourceIds,
      support: "corroborating",
      derivation: "extracted",
      confidence: 0.5,
      verifiedAt: AT,
    };
  };
  return {
    status: "partial",
    researchedOrigin: ORIGIN,
    facts: {
      industryDescription: null,
      productsServices: ["Alpha", "Beta", "Gamma", "Zeta"],
      customerSegments: [],
      operatingMarkets: [],
    },
    sources: [srcApex, srcWww],
    evidence: [
      ev("Alpha", [srcApex.id]),
      ev("Beta", [srcApex.id]),
      ev("Gamma", [srcApex.id]),
      ev("Zeta", [srcWww.id]),
    ],
    reasons: [],
    conflicts: [],
  };
}

test("B2: description evidence excludes sources that back only omitted facts", () => {
  const r = assemble(confirmedInput(splitSourceProductsBusiness()));
  const apexId = businessSourceId(ORIGIN);
  const wwwId = businessSourceId("https://www.przyklad.example");
  const krsId = r.sources.find((s) => s.provider === "krs")!.id;

  // The 3/2/3 limit renders Alpha/Beta/Gamma; Zeta is omitted from the prose.
  const desc = r.profile.business.description!;
  assert.ok(desc.includes("Alpha") && desc.includes("Beta") && desc.includes("Gamma"));
  assert.ok(!desc.includes("Zeta"));

  // Zeta still survives in the profile and keeps its own business evidence.
  assert.deepEqual(r.profile.business.productsServices, ["Alpha", "Beta", "Gamma", "Zeta"]);
  const zetaId = businessItemId(PRODUCTS_SERVICES_PATH, canonicalKey("Zeta"));
  assert.ok(r.evidence.some((e) => e.target.itemId === zetaId));

  // Description evidence references only rendered facts' sources: KRS (legal name)
  // + the confirmed-origin source; it EXCLUDES the www source (backs only Zeta).
  const descEv = r.evidence.find((e) => e.target.path === "company.business.description")!;
  assert.deepEqual([...descEv.sourceIds].sort(), [krsId, apexId].sort());
  assert.ok(!descEv.sourceIds.includes(wwwId));
  // Every description source id still resolves in the returned source list.
  const sourceIds = new Set(r.sources.map((s) => s.id));
  for (const sid of descEv.sourceIds) assert.ok(sourceIds.has(sid));
});

// ===========================================================================
// B3. Sentence termination through the FULL assembler (asserts full description).
// ===========================================================================
const assemblerPunctuation: Array<[string, string]> = [
  ["Alfa!", "Alfa! Produkty i usługi: Usługi."],
  ["Alfa?»", "Alfa?» Produkty i usługi: Usługi."],
  ["Alfa.]", "Alfa.] Produkty i usługi: Usługi."],
  ['Alfa"', 'Alfa." Produkty i usługi: Usługi.'],
  ["Alfa]", "Alfa.] Produkty i usługi: Usługi."],
];
for (const [legalName, expected] of assemblerPunctuation) {
  test(`B3: full-assembly description for a legal name ending in "${legalName}"`, () => {
    const r = assemble({
      company: krsCompany({ legalName }),
      domainResolution: confirmedResolution(),
      businessResearch: productsOnlyBusiness(),
    });
    assert.equal(r.profile.business.description, expected);
    assert.ok(!r.profile.business.description!.includes(".."));
    assert.ok(!r.profile.business.description!.includes("!."));
    assert.ok(!r.profile.business.description!.includes("?."));
  });
}
