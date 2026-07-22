/**
 * Tests for `deriveDashboardSources`: the displayed "Źródła" set is derived
 * strictly from FactEvidence (KRS + every source actually backing a fact),
 * origin-only, deduplicated by normalized origin, and deterministically ordered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveDashboardSources } from "../dashboard/dashboardSources.ts";
import type { FactEvidence, ResearchSource } from "../../../contracts/companyResearch.ts";

const KRS: ResearchSource = {
  id: "src_krs_1",
  provider: "krs",
  type: "official_registry",
  authority: "primary",
  url: null,
  domain: null,
  retrievedAt: "2026-07-14T10:00:00.000Z",
  publishedAt: null,
};

function webSource(id: string, origin: string, domain: string): ResearchSource {
  return {
    id,
    provider: "openai_web_search",
    type: "official_company_website",
    authority: "primary",
    url: origin,
    domain,
    retrievedAt: "2026-07-14T10:00:00.000Z",
    publishedAt: null,
  };
}

function evidence(id: string, path: string, sourceIds: string[]): FactEvidence {
  return {
    id,
    target: { path, itemId: null },
    sourceIds,
    support: "direct",
    derivation: "registry",
    confidence: 1,
    verifiedAt: "2026-07-14T10:00:00.000Z",
  };
}

test("(sources) includes KRS plus every source referenced by evidence", () => {
  const web = webSource("src_web_1", "https://przyklad.example", "przyklad.example");
  const result = deriveDashboardSources(
    [
      evidence("fev_krs", "company.identity.legalName", [KRS.id]),
      evidence("fev_web", "company.website.url", [web.id]),
    ],
    [KRS, web],
  );
  assert.equal(result.length, 2);
  assert.ok(result.some((s) => s.provider === "krs"));
  assert.ok(result.some((s) => s.id === web.id && s.url === "https://przyklad.example"));
});

test("(sources) drops a source that no evidence references (never shown from a bare field)", () => {
  const web = webSource("src_web_1", "https://przyklad.example", "przyklad.example");
  // Only KRS is referenced by evidence; the web source has no backing evidence.
  const result = deriveDashboardSources(
    [evidence("fev_krs", "company.identity.legalName", [KRS.id])],
    [KRS, web],
  );
  assert.deepEqual(result.map((s) => s.id), [KRS.id]);
});

test("(sources) deduplicates web sources by normalized origin", () => {
  const a = webSource("src_web_a", "https://przyklad.example", "przyklad.example");
  const b = webSource("src_web_b", "https://przyklad.example", "przyklad.example");
  const result = deriveDashboardSources(
    [
      evidence("fev_a", "company.website.url", [a.id]),
      evidence("fev_b", "company.business.description", [b.id]),
    ],
    [a, b],
  );
  const webs = result.filter((s) => s.provider === "openai_web_search");
  assert.equal(webs.length, 1);
});

test("(sources) orders the registry first, then web sources by domain", () => {
  const z = webSource("src_web_z", "https://zzz.example", "zzz.example");
  const a = webSource("src_web_a", "https://aaa.example", "aaa.example");
  const result = deriveDashboardSources(
    [
      evidence("fev_krs", "company.identity.legalName", [KRS.id]),
      evidence("fev_z", "company.website.url", [z.id]),
      evidence("fev_a", "company.business.description", [a.id]),
    ],
    [KRS, z, a],
  );
  assert.deepEqual(result.map((s) => s.domain), [null, "aaa.example", "zzz.example"]);
});

test("(sources) returns an empty list when nothing is evidence-backed", () => {
  assert.deepEqual(deriveDashboardSources([], [KRS]), []);
});
