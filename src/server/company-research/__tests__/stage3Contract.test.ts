import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_RESEARCH_VERSION,
} from "../../../contracts/companyResearch.ts";
import { companyResearchResponseSchema } from "../../../contracts/companyResearchSchema.ts";
import {
  buildCompletedResponse,
  buildKrsFactEvidence,
  buildKrsSource,
} from "../mappers/toDashboardResponse.ts";
import {
  buildNeedsConfirmationResponse,
  buildWebSource,
} from "../mappers/toIdentificationResponse.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import type { CompletedResponse } from "../../../contracts/companyResearch.ts";
import type { ScoredCandidate } from "../identification/types.ts";
import type { KrsCompany, NormalizedQuery } from "../types.ts";

const RETRIEVED_AT = "2026-07-14T10:00:00.000Z";

function krsCompany(overrides: Partial<KrsCompany> = {}): KrsCompany {
  return {
    krs: "0000123456",
    legalName: "PRZYKŁADOWA SP. Z O.O.",
    legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
    nip: "1234563218",
    regon: "123456785",
    registrationDate: "2011-01-01",
    city: "WARSZAWA",
    region: "MAZOWIECKIE",
    countryCode: "PL",
    pkdPrimaryCode: "62.01.Z",
    pkdSecondaryCodes: [],
    pkdLabels: [],
    retrievedAt: RETRIEVED_AT,
    ...overrides,
  };
}

const query: NormalizedQuery = {
  name: "Przykładowa",
  countryCode: "PL",
  krs: "0000123456",
};

function completed(company: KrsCompany = krsCompany(), q: NormalizedQuery = query): CompletedResponse {
  return buildCompletedResponse({
    requestId: "req-1",
    query: q,
    company,
    version: COMPANY_RESEARCH_VERSION,
    researchedAt: RETRIEVED_AT,
  });
}

/** Cast helper to tamper with an object without using `any`. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

// 1 — stage3 version.
test("COMPANY_RESEARCH_VERSION is bumped to stage3", () => {
  assert.equal(COMPANY_RESEARCH_VERSION, "1.0.0-stage3");
});

// 2 — strict FactEvidence validation (happy path through the response schema).
test("a completed response with KRS evidence validates against the strict schema", () => {
  const parsed = companyResearchResponseSchema.safeParse(completed());
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});

// 3 — confidence outside 0..1 rejected.
test("FactEvidence confidence outside 0..1 is rejected", () => {
  const res = completed();
  asRecord(res.evidence.facts[0]).confidence = 1.5;
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);

  const res2 = completed();
  asRecord(res2.evidence.facts[0]).confidence = -0.1;
  assert.ok(!companyResearchResponseSchema.safeParse(res2).success);
});

// 4 — empty sourceIds rejected.
test("FactEvidence with empty sourceIds is rejected", () => {
  const res = completed();
  asRecord(res.evidence.facts[0]).sourceIds = [];
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 5 — duplicate sourceIds rejected.
test("FactEvidence with duplicate sourceIds is rejected", () => {
  const res = completed();
  asRecord(res.evidence.facts[0]).sourceIds = ["src_krs_1", "src_krs_1"];
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 6 — unknown FactEvidence fields rejected.
test("unknown FactEvidence fields are rejected (strict object)", () => {
  const res = completed();
  asRecord(res.evidence.facts[0]).unexpected = true;
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 7 — completed KRS-only response contains correct KRS evidence.
test("completed KRS-only response contains correct registry evidence", () => {
  const res = completed();
  const legal = res.evidence.facts.find(
    (f) => f.target.path === "company.identity.legalName",
  );
  assert.ok(legal, "expected legalName evidence");
  assert.equal(legal.support, "direct");
  assert.equal(legal.derivation, "registry");
  assert.equal(legal.confidence, 1);
  assert.equal(legal.target.itemId, null);
  assert.equal(legal.verifiedAt, RETRIEVED_AT);
  assert.deepEqual(legal.sourceIds, ["src_krs_1"]);
  // every evidence entry references a source that actually exists in the payload.
  const sourceIds = new Set(res.sources.map((s) => s.id));
  for (const fact of res.evidence.facts) {
    for (const id of fact.sourceIds) assert.ok(sourceIds.has(id), `missing source ${id}`);
  }
});

// 8 — absent optional KRS values do not create fake evidence.
test("absent optional KRS values produce no fabricated evidence", () => {
  const bare = krsCompany({
    nip: undefined,
    regon: undefined,
    legalForm: undefined,
    registrationDate: undefined,
    city: undefined,
    region: undefined,
  });
  const facts = buildKrsFactEvidence(bare, buildKrsSource(bare).id, RETRIEVED_AT);
  const paths = facts.map((f) => f.target.path);
  // Always-present facts remain.
  assert.ok(paths.includes("company.identity.legalName"));
  assert.ok(paths.includes("company.identity.identifiers.krs"));
  assert.ok(paths.includes("company.location.countryCode"));
  // Absent optionals are NOT fabricated.
  for (const absent of [
    "company.identity.identifiers.nip",
    "company.identity.identifiers.regon",
    "company.identity.legalForm",
    "company.identity.registrationDate",
    "company.location.city",
    "company.location.region",
  ]) {
    assert.ok(!paths.includes(absent), `unexpected evidence for ${absent}`);
  }
});

// 9 — source URL with a path is rejected before public output.
test("a source URL carrying a path is rejected by the public schema", () => {
  const web = buildWebSource({ origin: "https://company.example", hostname: "company.example" }, RETRIEVED_AT);
  const res = buildCompletedResponse({
    requestId: "req-1",
    query,
    company: krsCompany(),
    version: COMPANY_RESEARCH_VERSION,
    researchedAt: RETRIEVED_AT,
    extraSources: [web],
  });
  asRecord(res.sources[1]).url = "https://company.example/products/example";
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 10 — query and fragment never reach public output.
test("a source URL with query and fragment is rejected by the public schema", () => {
  const web = buildWebSource({ origin: "https://company.example", hostname: "company.example" }, RETRIEVED_AT);
  const res = buildCompletedResponse({
    requestId: "req-1",
    query,
    company: krsCompany(),
    version: COMPANY_RESEARCH_VERSION,
    researchedAt: RETRIEVED_AT,
    extraSources: [web],
  });
  asRecord(res.sources[1]).url = "https://company.example/path?query=value#fragment";
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 11 — public source contains origin only.
test("buildWebSource emits an origin-only URL and validates", () => {
  const web = buildWebSource(
    { origin: "https://company.example", hostname: "company.example" },
    RETRIEVED_AT,
  );
  assert.equal(web.url, "https://company.example");
  assert.equal(web.domain, "company.example");
  assert.equal(web.provider, "openai_web_search");
  assert.equal(web.type, "discovery_source");

  const res = buildCompletedResponse({
    requestId: "req-1",
    query,
    company: krsCompany(),
    version: COMPANY_RESEARCH_VERSION,
    researchedAt: RETRIEVED_AT,
    extraSources: [web],
  });
  assert.ok(companyResearchResponseSchema.safeParse(res).success);
});

// 12 — sources[].supports no longer exists.
test("sources no longer carry a `supports` attribution array", () => {
  const res = completed();
  for (const source of res.sources) {
    assert.ok(!("supports" in source), "supports must be removed from sources");
  }
  // And the schema rejects it if reintroduced.
  asRecord(res.sources[0]).supports = ["company.identity.legalName"];
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 13 — strict response schema rejects legacy source attribution (title + supports).
test("the strict schema rejects the legacy source shape (title + supports)", () => {
  const res = completed();
  asRecord(res.sources[0]).title = "Krajowy Rejestr Sądowy (odpis aktualny)";
  asRecord(res.sources[0]).supports = ["company.identity.legalName"];
  assert.ok(!companyResearchResponseSchema.safeParse(res).success);
});

// 14 — no personal-data fields were introduced (incl. structured conflicts/warnings).
test("stage3 payloads carry no personal-data keys", () => {
  const res = completed();
  assert.doesNotThrow(() => assertNoPersonalData(res, "response"));

  // Force the name-mismatch path so structured conflicts/warnings are populated.
  const mismatch = completed(krsCompany(), {
    name: "Zupełnie Inna Nazwa",
    countryCode: "PL",
    krs: "0000123456",
  });
  assert.ok(mismatch.quality.conflicts.length >= 1);
  assert.equal(mismatch.quality.conflicts[0].code, "legal_name_mismatch");
  assert.equal(mismatch.quality.conflicts[0].resolution, "krs_preferred");
  assert.deepEqual(mismatch.quality.conflicts[0].sourceIds, ["src_krs_1"]);
  assert.equal(mismatch.quality.warnings[0].code, "query_name_mismatch");
  assert.equal(mismatch.quality.warnings[0].targetPath, "company.identity.legalName");
  assert.doesNotThrow(() => assertNoPersonalData(mismatch, "response"));
  assert.ok(companyResearchResponseSchema.safeParse(mismatch).success);
});

// 15 — existing identification flows still validate under the stage3 contract.
test("needs_confirmation (identification) responses still validate", () => {
  const scored: ScoredCandidate[] = [
    {
      krsCompany: krsCompany({ krs: "0000000001", legalName: "Alfa Sp. z o.o." }),
      discovered: { legalName: "Alfa", krs: "0000000001", countryCode: "PL" },
      strength: "exact",
      confidence: 0.9,
      matchReasons: ["Numer KRS potwierdzony w oficjalnym rejestrze"],
    },
  ];
  const nc = buildNeedsConfirmationResponse({
    requestId: "req-1",
    query: { name: "Alfa", countryCode: "PL" },
    scored,
    webSources: [{ origin: "https://alfa.example", hostname: "alfa.example" }],
    retrievedAt: RETRIEVED_AT,
  });
  const parsed = companyResearchResponseSchema.safeParse(nc);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));

  const web = nc.sources.find((s) => s.provider === "openai_web_search");
  assert.ok(web, "expected an openai_web_search discovery source");
  assert.equal(web.url, "https://alfa.example");
  assert.doesNotThrow(() => assertNoPersonalData(nc, "response"));
});
