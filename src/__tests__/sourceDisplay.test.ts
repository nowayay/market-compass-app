/**
 * Tests for the "Źródła" source display mapping (`describeSource`): the label,
 * origin host and origin URL shown for each source type.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSource } from "../lib/company-research/sourceDisplay.ts";
import type { ResearchSource } from "../contracts/companyResearch.ts";

function source(overrides: Partial<ResearchSource> = {}): ResearchSource {
  return {
    id: "src_1",
    provider: "openai_web_search",
    type: "official_company_website",
    authority: "primary",
    url: "https://przyklad.example",
    domain: "przyklad.example",
    retrievedAt: "2026-07-14T10:00:00.000Z",
    publishedAt: null,
    ...overrides,
  };
}

test("(render) an official company website is labeled 'Strona firmowa' with its origin", () => {
  const d = describeSource(source());
  assert.equal(d.label, "Strona firmowa");
  assert.equal(d.domain, "przyklad.example");
  assert.equal(d.url, "https://przyklad.example");
});

test("(render) the KRS registry keeps its Polish label and has no URL", () => {
  const d = describeSource(source({ provider: "krs", type: "official_registry", url: null, domain: null }));
  assert.equal(d.label, "Krajowy Rejestr Sądowy");
  assert.equal(d.domain, null);
  assert.equal(d.url, null);
});

test("(render) a non-website web source falls back to the provider label", () => {
  const d = describeSource(source({ type: "discovery_source" }));
  assert.equal(d.label, "Wyszukiwanie internetowe (AI)");
});
