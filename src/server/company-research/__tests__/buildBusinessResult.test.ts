import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBusinessResult, buildSkippedResult } from "../business-research/buildBusinessResult.ts";
import {
  BUSINESS_FACT_CONFIDENCE,
  CUSTOMER_SEGMENTS_PATH,
  INDUSTRY_DESCRIPTION_PATH,
  OPERATING_MARKETS_PATH,
  PRODUCTS_SERVICES_PATH,
} from "../business-research/buildBusinessEvidence.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import type { BusinessAmbiguityCode, RawBusinessFacts } from "../business-research/types.ts";

const ORIGIN = "https://przyklad.example";
const DOMAIN = "przyklad.example";
const AT = "2026-07-17T00:00:00.000Z";

function raw(o: Partial<RawBusinessFacts> = {}): RawBusinessFacts {
  return {
    industryDescription: null,
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
    ambiguityCodes: [],
    ...o,
  };
}

function build(o: {
  raw?: Partial<RawBusinessFacts>;
  sourceOrigins?: string[];
  researchedAt?: string;
}) {
  return buildBusinessResult({
    raw: raw(o.raw),
    sourceOrigins: o.sourceOrigins ?? [ORIGIN],
    targetOrigin: ORIGIN,
    targetDomain: DOMAIN,
    researchedAt: o.researchedAt ?? AT,
  });
}

const fullFacts = {
  industryDescription: "Custom software development",
  productsServices: ["Web applications", "Mobile apps"],
  customerSegments: ["SMEs", "Startups"],
  operatingMarkets: ["Poland", "Germany"],
};

// (33) completed status table
test("all four categories + a valid source → completed with evidence", () => {
  const r = build({ raw: fullFacts });
  assert.equal(r.status, "completed");
  assert.equal(r.researchedOrigin, ORIGIN);
  assert.equal(r.sources.length, 1);
  assert.ok(r.evidence.length >= 1);
  // (42/43) every material fact has evidence; every evidence sourceId resolves.
  const sourceIds = new Set(r.sources.map((s) => s.id));
  for (const e of r.evidence) {
    assert.ok(e.sourceIds.length >= 1);
    for (const sid of e.sourceIds) assert.ok(sourceIds.has(sid));
  }
  const materialCount = 1 + fullFacts.productsServices.length + fullFacts.customerSegments.length + fullFacts.operatingMarkets.length;
  assert.equal(r.evidence.length, materialCount);
});

// (34) partial status table
test("a missing category → partial", () => {
  const r = build({ raw: { ...fullFacts, customerSegments: [] } });
  assert.equal(r.status, "partial");
  assert.deepEqual(r.facts.customerSegments, []);
  assert.ok(r.sources.length === 1 && r.evidence.length >= 1);
});

// (35) unverified: valid response but no acceptable facts
test("no accepted facts + a source → unverified with empty sources/evidence", () => {
  const r = build({ raw: {}, sourceOrigins: [ORIGIN] });
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("INSUFFICIENT_BUSINESS_EVIDENCE"));
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.evidence, []);
});

// (36) no valid source → discard facts + unverified
test("facts present but no valid source → unverified, facts/sources/evidence discarded", () => {
  const r = build({ raw: fullFacts, sourceOrigins: [] });
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("NO_ATTESTED_SOURCES"));
  assert.equal(r.facts.industryDescription, null);
  assert.deepEqual(r.facts.productsServices, []);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.evidence, []);
});

test("off-domain / subdomain source origins are not valid sources", () => {
  const r = build({ raw: fullFacts, sourceOrigins: ["https://blog.przyklad.example", "https://other.example"] });
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("NO_ATTESTED_SOURCES"));
});

// (29) entity-scope ambiguity drops all facts → unverified
test("entity-scope ambiguity discards ALL facts and returns unverified", () => {
  for (const code of ["multiple_legal_entities", "group_scope_unclear", "subsidiary_scope_unclear"] as BusinessAmbiguityCode[]) {
    const r = build({ raw: { ...fullFacts, ambiguityCodes: [code] } });
    assert.equal(r.status, "unverified");
    assert.equal(r.facts.industryDescription, null);
    assert.deepEqual(r.facts.productsServices, []);
    assert.deepEqual(r.sources, []);
    assert.deepEqual(r.evidence, []);
    assert.ok(r.reasons.includes("ENTITY_SCOPE_AMBIGUITY"));
    assert.ok(r.conflicts.length >= 1);
  }
});

// (30) category ambiguity drops only the affected category
test("contradictory_offerings drops only productsServices", () => {
  const r = build({ raw: { ...fullFacts, ambiguityCodes: ["contradictory_offerings"] } });
  assert.deepEqual(r.facts.productsServices, []);
  assert.equal(r.facts.industryDescription, "Custom software development");
  assert.deepEqual(r.facts.customerSegments, ["SMEs", "Startups"]);
  assert.ok(r.conflicts.includes("CONTRADICTORY_OFFERINGS"));
  assert.equal(r.status, "partial");
});

test("each contradictory_* code drops exactly its own category", () => {
  const a = build({ raw: { ...fullFacts, ambiguityCodes: ["contradictory_activities"] } });
  assert.equal(a.facts.industryDescription, null);
  const c = build({ raw: { ...fullFacts, ambiguityCodes: ["contradictory_customer_segments"] } });
  assert.deepEqual(c.facts.customerSegments, []);
  const m = build({ raw: { ...fullFacts, ambiguityCodes: ["contradictory_markets"] } });
  assert.deepEqual(m.facts.operatingMarkets, []);
});

// (B) third_party_listing_scope discards productsServices and can never complete
test("third_party_listing_scope with all four categories → products dropped, partial", () => {
  const r = build({ raw: { ...fullFacts, ambiguityCodes: ["third_party_listing_scope"] } });
  assert.ok(r.conflicts.includes("THIRD_PARTY_LISTING_SCOPE"));
  assert.deepEqual(r.facts.productsServices, []);
  assert.equal(r.status, "partial");
  assert.notEqual(r.status, "completed");
  // No productsServices evidence remains.
  assert.ok(!r.evidence.some((e) => e.target.path === PRODUCTS_SERVICES_PATH));
});

test("third_party_listing_scope with ONLY productsServices → all facts empty, unverified", () => {
  const r = build({
    raw: { industryDescription: null, productsServices: ["Reseller item"], customerSegments: [], operatingMarkets: [], ambiguityCodes: ["third_party_listing_scope"] },
  });
  assert.equal(r.status, "unverified");
  assert.deepEqual(r.facts.productsServices, []);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.evidence, []);
  assert.ok(r.conflicts.includes("THIRD_PARTY_LISTING_SCOPE"));
});

test("third_party_listing_scope with products already empty → partial, never completed", () => {
  const r = build({
    raw: { industryDescription: "Custom software development", productsServices: [], customerSegments: ["SMEs"], operatingMarkets: ["Poland"], ambiguityCodes: ["third_party_listing_scope"] },
  });
  assert.equal(r.status, "partial");
  assert.notEqual(r.status, "completed");
  assert.ok(r.conflicts.includes("THIRD_PARTY_LISTING_SCOPE"));
});

// (C) insufficient_business_evidence globally discards all facts + evidence
test("insufficient_business_evidence discards everything regardless of populated categories", () => {
  const cases: Partial<RawBusinessFacts>[] = [
    { ...fullFacts, ambiguityCodes: ["insufficient_business_evidence"] }, // all populated
    { industryDescription: "Custom software development", productsServices: ["Web applications"], customerSegments: [], operatingMarkets: [], ambiguityCodes: ["insufficient_business_evidence"] }, // some
    { industryDescription: null, productsServices: [], customerSegments: [], operatingMarkets: [], ambiguityCodes: ["insufficient_business_evidence"] }, // none
  ];
  for (const raw of cases) {
    const r = build({ raw });
    assert.equal(r.status, "unverified");
    assert.equal(r.facts.industryDescription, null);
    assert.deepEqual(r.facts.productsServices, []);
    assert.deepEqual(r.facts.customerSegments, []);
    assert.deepEqual(r.facts.operatingMarkets, []);
    assert.deepEqual(r.sources, []);
    assert.deepEqual(r.evidence, []);
    assert.ok(r.reasons.includes("INSUFFICIENT_BUSINESS_EVIDENCE"));
  }
});

// (32) multiple_business_activities is non-blocking
test("multiple_business_activities is non-blocking and adds a reason", () => {
  const r = build({ raw: { ...fullFacts, ambiguityCodes: ["multiple_business_activities"] } });
  assert.equal(r.status, "completed");
  assert.ok(r.reasons.includes("MULTIPLE_BUSINESS_ACTIVITIES"));
  assert.deepEqual(r.facts.productsServices, ["Web applications", "Mobile apps"]);
});

// (41/44/45/46) evidence targets, support, confidence, derivation
test("evidence uses exact contract paths, corroborating support, fixed confidence, honest derivation", () => {
  const r = build({ raw: fullFacts });
  const byPath = new Map(r.evidence.map((e) => [e.target.path + (e.target.itemId ?? ""), e]));
  const industry = r.evidence.find((e) => e.target.path === INDUSTRY_DESCRIPTION_PATH);
  assert.ok(industry);
  assert.equal(industry.target.itemId, null);
  // (D) the model-authored industry description is honestly "synthesized".
  assert.equal(industry.derivation, "synthesized");
  for (const other of ["extracted", "normalized", "derived", "registry", "direct"]) {
    assert.notEqual(industry.derivation, other);
  }
  for (const e of r.evidence) {
    assert.equal(e.support, "corroborating");
    assert.notEqual(e.support, "direct");
    assert.equal(e.confidence, BUSINESS_FACT_CONFIDENCE);
    assert.equal(e.confidence, 0.5);
  }
  const listPaths = new Set(r.evidence.filter((e) => e.target.itemId !== null).map((e) => e.target.path));
  assert.deepEqual([...listPaths].sort(), [CUSTOMER_SEGMENTS_PATH, OPERATING_MARKETS_PATH, PRODUCTS_SERVICES_PATH].sort());
  for (const e of r.evidence) {
    if (e.target.itemId !== null) assert.equal(e.derivation, "extracted");
    assert.ok(!/\[\d+\]/.test(e.target.itemId ?? "")); // no array index in ids
    void byPath;
  }
});

// (37/38/39/40) stable IDs, independent of retrievedAt and array order
test("source/item/evidence IDs are stable and independent of retrievedAt and order", () => {
  const r1 = build({ raw: fullFacts, researchedAt: "2026-01-01T00:00:00.000Z" });
  const r2 = build({
    raw: { ...fullFacts, productsServices: ["Mobile apps", "Web applications"] }, // reversed
    researchedAt: "2030-12-31T23:59:59.000Z",
  });
  assert.deepEqual(r1.sources.map((s) => s.id), r2.sources.map((s) => s.id)); // (37/38)
  assert.deepEqual(
    r1.evidence.map((e) => e.id).sort(),
    r2.evidence.map((e) => e.id).sort(),
  ); // (39/40) same ids despite reversed input order
});

// (47) deterministic ordering
test("sources, evidence, reasons and conflicts are deterministically ordered", () => {
  const r = build({ raw: { ...fullFacts, ambiguityCodes: ["contradictory_markets", "third_party_listing_scope", "multiple_business_activities"] } });
  const sourceIds = r.sources.map((s) => s.id);
  assert.deepEqual(sourceIds, [...sourceIds].sort());
  assert.deepEqual(r.conflicts, ["THIRD_PARTY_LISTING_SCOPE", "CONTRADICTORY_MARKETS"]);
});

// (48) detached result mutation isolation
test("the result is fully detached from the raw provider facts", () => {
  const input = raw(fullFacts);
  const r = buildBusinessResult({ raw: input, sourceOrigins: [ORIGIN], targetOrigin: ORIGIN, targetDomain: DOMAIN, researchedAt: AT });
  input.productsServices.push("Injected");
  assert.deepEqual(r.facts.productsServices, ["Web applications", "Mobile apps"]);
  const evidenceSourceIds = r.evidence[0].sourceIds;
  evidenceSourceIds.push("src_injected");
  assert.ok(!r.sources.some((s) => s.id === "src_injected"));
  r.facts.productsServices.push("Mutated");
  assert.deepEqual(input.productsServices, ["Web applications", "Mobile apps", "Injected"]);
});

test("the final result passes the personal-data guard", () => {
  const r = build({ raw: fullFacts });
  assert.doesNotThrow(() => assertNoPersonalData(r, "businessResearchResult"));
});

test("buildSkippedResult is a fixed skipped result", () => {
  const r = buildSkippedResult();
  assert.equal(r.status, "skipped");
  assert.equal(r.researchedOrigin, null);
  assert.deepEqual(r.reasons, ["DOMAIN_NOT_CONFIRMED"]);
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.evidence, []);
});
