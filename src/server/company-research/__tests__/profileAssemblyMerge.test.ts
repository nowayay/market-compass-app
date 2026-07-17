import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSources } from "../profile-assembly/sources.ts";
import { mergeEvidence } from "../profile-assembly/evidence.ts";
import { ProfileAssemblyInvariantError } from "../profile-assembly/errors.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";

function source(o: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: "src_web_a",
    provider: "openai_web_search",
    type: "official_company_website",
    authority: "primary",
    url: "https://a.example",
    domain: "a.example",
    retrievedAt: "2026-07-17T00:00:00.000Z",
    publishedAt: null,
    ...o,
  };
}

function evidence(o: Partial<FactEvidence> = {}): FactEvidence {
  return {
    id: "fev_a",
    target: { path: "company.business.productsServices", itemId: "itm_a" },
    sourceIds: ["src_web_a"],
    support: "corroborating",
    derivation: "extracted",
    confidence: 0.5,
    verifiedAt: "2026-07-17T00:00:00.000Z",
    ...o,
  };
}

// (22) sources deduplicate deterministically and order by id.
test("mergeSources: dedupes identical ids and orders by id", () => {
  const merged = mergeSources([
    source({ id: "src_web_b", url: "https://b.example", domain: "b.example" }),
    source({ id: "src_krs_1", provider: "krs", type: "official_registry", url: null, domain: null }),
    source({ id: "src_web_b", url: "https://b.example", domain: "b.example" }), // identical dup
  ]);
  assert.deepEqual(merged.map((s) => s.id), ["src_krs_1", "src_web_b"]);
});

// (22) input arrays/objects are never mutated.
test("mergeSources: does not mutate or alias inputs", () => {
  const input = source();
  const merged = mergeSources([input]);
  assert.notEqual(merged[0], input);
  merged[0].domain = "changed.example";
  assert.equal(input.domain, "a.example");
});

// (23) a conflicting duplicate source id throws.
test("mergeSources: conflicting duplicate id throws", () => {
  assert.throws(
    () => mergeSources([source(), source({ domain: "different.example" })]),
    ProfileAssemblyInvariantError,
  );
});

// (24) evidence deduplicates deterministically.
test("mergeEvidence: dedupes identical ids and orders canonically", () => {
  const valid = new Set(["src_web_a"]);
  const merged = mergeEvidence(
    [
      [evidence({ id: "fev_b", target: { path: "company.business.operatingMarkets", itemId: "itm_b" } })],
      [evidence()],
      [evidence()], // identical dup of fev_a
    ],
    valid,
  );
  // Canonical order is by target path: operatingMarkets (fev_b) precedes
  // productsServices (fev_a).
  assert.deepEqual(merged.map((e) => e.id), ["fev_b", "fev_a"]);
});

// (25) a conflicting duplicate evidence id throws.
test("mergeEvidence: conflicting duplicate id throws", () => {
  const valid = new Set(["src_web_a"]);
  assert.throws(
    () => mergeEvidence([[evidence(), evidence({ confidence: 0.9 })]], valid),
    ProfileAssemblyInvariantError,
  );
});

// (B) evidence with empty sourceIds throws.
test("mergeEvidence: empty sourceIds throws", () => {
  const valid = new Set(["src_web_a"]);
  assert.throws(
    () => mergeEvidence([[evidence({ sourceIds: [] })]], valid),
    ProfileAssemblyInvariantError,
  );
});

// (B) evidence with duplicate sourceIds throws (never silently de-duplicated).
test("mergeEvidence: duplicate sourceIds throws", () => {
  const valid = new Set(["src_web_a"]);
  assert.throws(
    () => mergeEvidence([[evidence({ sourceIds: ["src_web_a", "src_web_a"] })]], valid),
    ProfileAssemblyInvariantError,
  );
});

// (26) evidence referencing a missing source throws.
test("mergeEvidence: missing source reference throws", () => {
  const valid = new Set(["src_web_a"]);
  assert.throws(
    () => mergeEvidence([[evidence({ sourceIds: ["src_web_a", "src_missing"] })]], valid),
    ProfileAssemblyInvariantError,
  );
});

// (27) a duplicate (path, itemId) target pair throws.
test("mergeEvidence: duplicate target/item pair throws", () => {
  const valid = new Set(["src_web_a"]);
  assert.throws(
    () => mergeEvidence([[evidence({ id: "fev_a" }), evidence({ id: "fev_other" })]], valid),
    ProfileAssemblyInvariantError,
  );
});

// (35) evidence merge copies records and detaches sourceIds arrays.
test("mergeEvidence: does not mutate or alias inputs", () => {
  const valid = new Set(["src_web_a"]);
  const input = evidence();
  const merged = mergeEvidence([[input]], valid);
  assert.notEqual(merged[0], input);
  assert.notEqual(merged[0].sourceIds, input.sourceIds);
  merged[0].sourceIds.push("src_extra");
  assert.deepEqual(input.sourceIds, ["src_web_a"]);
});

// order-independence: reversing the input yields an identical merged result.
test("merge results are independent of input order", () => {
  const valid = new Set(["src_web_a"]);
  const a = mergeEvidence(
    [[evidence({ id: "fev_1", target: { path: "a.b", itemId: null } })], [evidence({ id: "fev_2", target: { path: "a.a", itemId: null } })]],
    valid,
  );
  const b = mergeEvidence(
    [[evidence({ id: "fev_2", target: { path: "a.a", itemId: null } })], [evidence({ id: "fev_1", target: { path: "a.b", itemId: null } })]],
    valid,
  );
  assert.deepEqual(a, b);
});
