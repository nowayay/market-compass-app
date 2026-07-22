import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDomainCandidates } from "../domain-discovery/extractDomainCandidates.ts";
import type { RawDomainCandidate } from "../domain-discovery/schema.ts";
import type { SafeDiscoveredSource } from "../identification/webSourceSecurity.ts";

const NO_SIGNALS = {
  matchedLegalName: null,
  matchedKrs: null,
  matchedNip: null,
  matchedRegon: null,
  matchedCity: null,
};

function raw(url: string): RawDomainCandidate {
  return { url, signals: { ...NO_SIGNALS } };
}

function attested(...origins: string[]): SafeDiscoveredSource[] {
  return origins.map((origin) => ({ origin, hostname: new URL(origin).hostname }));
}

test("rejects a URL that appears only in model output (not attested)", () => {
  const result = extractDomainCandidates(
    [raw("https://model-only.example/x")],
    attested("https://other.example"),
  );
  assert.equal(result.length, 0);
});

test("accepts a candidate whose origin is attested", () => {
  const result = extractDomainCandidates(
    [raw("https://company.example/products")],
    attested("https://company.example"),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].origin, "https://company.example");
  assert.equal(result[0].domain, "company.example");
});

test("normalizes a full page path to origin (path/query/fragment removed)", () => {
  const result = extractDomainCandidates(
    [raw("https://company.example/a/b/page.html?ref=x&q=1#section")],
    attested("https://company.example"),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].origin, "https://company.example");
  // No exact page path survives.
  const dump = JSON.stringify(result);
  assert.ok(!dump.includes("/a/b"));
  assert.ok(!dump.includes("page.html"));
  assert.ok(!dump.includes("ref=x"));
  assert.ok(!dump.includes("section"));
});

test("matches candidate and attested pages under the same origin (different paths)", () => {
  const result = extractDomainCandidates(
    [raw("https://company.example/o-nas")],
    attested("https://company.example"), // attested came from /kontakt originally, normalized
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].origin, "https://company.example");
});

test("deduplicates candidates by normalized origin", () => {
  const result = extractDomainCandidates(
    [raw("https://company.example/a"), raw("https://company.example/b")],
    attested("https://company.example"),
  );
  assert.equal(result.length, 1);
});

test("rejects localhost", () => {
  const result = extractDomainCandidates(
    [raw("http://localhost/x")],
    attested("http://localhost"),
  );
  assert.equal(result.length, 0);
});

test("rejects IP literals", () => {
  const result = extractDomainCandidates(
    [raw("http://127.0.0.1/x"), raw("http://93.184.216.34/y")],
    attested("http://127.0.0.1", "http://93.184.216.34"),
  );
  assert.equal(result.length, 0);
});

test("rejects credential-bearing URLs", () => {
  const result = extractDomainCandidates(
    [raw("https://user:pass@company.example/x")],
    attested("https://company.example"),
  );
  assert.equal(result.length, 0);
});

test("rejects a blocked social-media domain (attested)", () => {
  const result = extractDomainCandidates(
    [raw("https://linkedin.com/company/przykladowa")],
    attested("https://linkedin.com"),
  );
  assert.equal(result.length, 0);
});

test("rejects a blocked directory / encyclopedia domain (attested)", () => {
  const result = extractDomainCandidates(
    [raw("https://rejestr.io/x"), raw("https://pl.wikipedia.org/wiki/X")],
    attested("https://rejestr.io", "https://pl.wikipedia.org"),
  );
  assert.equal(result.length, 0);
});

test("rejects a subdomain of a blocked domain", () => {
  const result = extractDomainCandidates(
    [raw("https://careers.linkedin.com/x")],
    attested("https://careers.linkedin.com"),
  );
  assert.equal(result.length, 0);
});

test("accepts an ordinary company-looking public domain", () => {
  const result = extractDomainCandidates(
    [raw("https://nordicfurniture.example/about")],
    attested("https://nordicfurniture.example"),
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].domain, "nordicfurniture.example");
});

test("no exact URL and no verified/official/confidence field survives in the result", () => {
  const result = extractDomainCandidates(
    [{ url: "https://company.example/secret/page?token=abc#frag", signals: { ...NO_SIGNALS, matchedCity: "Warszawa" } }],
    attested("https://company.example"),
  );
  const dump = JSON.stringify(result);
  assert.ok(!dump.includes("secret"));
  assert.ok(!dump.includes("token=abc"));
  for (const forbidden of ["verified", "official", "confidence", "score"]) {
    assert.ok(!dump.includes(forbidden), `unexpected field: ${forbidden}`);
  }
  // sourceOrigins carries only the origin (no exact URL).
  assert.deepEqual(result[0].sourceOrigins, ["https://company.example"]);
});

test("caps the result at the maximum candidate count", () => {
  const result = extractDomainCandidates(
    [raw("https://a.example/1"), raw("https://b.example/2"), raw("https://c.example/3"), raw("https://d.example/4")],
    attested("https://a.example", "https://b.example", "https://c.example", "https://d.example"),
  );
  assert.equal(result.length, 3);
});

test("every sourceOrigins value is origin-only and corresponds to attested metadata", () => {
  const attestedSources = attested("https://company.example");
  const attestedOrigins = new Set(attestedSources.map((s) => s.origin));
  const result = extractDomainCandidates(
    [raw("https://company.example/products/item?q=1#frag")],
    attestedSources,
  );
  assert.equal(result.length, 1);
  for (const origin of result[0].sourceOrigins) {
    // origin-only: equals its own URL origin (no path except "/", no query/fragment)
    const parsed = new URL(origin);
    assert.equal(origin, parsed.origin);
    assert.equal(parsed.pathname, "/");
    assert.equal(parsed.search, "");
    assert.equal(parsed.hash, "");
    // corresponds to provider-attested metadata
    assert.ok(attestedOrigins.has(origin));
  }
});
