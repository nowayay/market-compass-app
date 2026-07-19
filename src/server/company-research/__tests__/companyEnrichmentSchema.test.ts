import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_ENRICHMENT_JSON_SCHEMA,
  parseCompanyEnrichmentOutput,
} from "../enrichment/schema.ts";
import {
  CompanyEnrichmentPrivacyError,
  InvalidCompanyEnrichmentResponseError,
} from "../enrichment/errors.ts";

const schema = COMPANY_ENRICHMENT_JSON_SCHEMA as {
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, { type: unknown; maxItems?: number; maxLength?: number; items?: { maxLength?: number } }>;
};

/** A structurally valid, personal-data-free raw model output. */
const VALID = {
  description: "Firma tworzy oprogramowanie na zamówienie.",
  industry: "Oprogramowanie",
  foundedYear: 2010,
  website: "https://przyklad.example",
  productsServices: ["Aplikacje webowe"],
  customerSegments: ["MŚP"],
  operatingMarkets: ["Polska"],
};

// --- Strict JSON Schema shape ------------------------------------------------

test("schema is strict: additionalProperties false, all seven fields required", () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.slice().sort(), [
    "customerSegments",
    "description",
    "foundedYear",
    "industry",
    "operatingMarkets",
    "productsServices",
    "website",
  ]);
});

test("schema exposes no financial/person/citation fields", () => {
  const dump = JSON.stringify(schema);
  for (const forbidden of [
    "revenue", "profit", "valuation", "employees", "owner", "founder", "board",
    "representative", "contactPerson", "email", "phone", "pesel", "social",
    "citation", "sourceId", "confidence", "snippet", "pageContent",
  ]) {
    assert.ok(!dump.includes(forbidden), `schema exposes forbidden: ${forbidden}`);
  }
});

// --- The real parser: valid inputs -------------------------------------------

test("a valid object parses unchanged (no removal/substitution/truncation)", () => {
  assert.deepEqual(parseCompanyEnrichmentOutput(VALID), { ...VALID });
});

test("null foundedYear/website and empty arrays are accepted", () => {
  const parsed = parseCompanyEnrichmentOutput({
    description: "",
    industry: "",
    foundedYear: null,
    website: null,
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
  });
  assert.equal(parsed.foundedYear, null);
  assert.equal(parsed.website, null);
  assert.equal(parsed.description, "");
});

test("a JSON string is parsed the same as an object", () => {
  const parsed = parseCompanyEnrichmentOutput(JSON.stringify(VALID));
  assert.deepEqual(parsed, { ...VALID });
});

// --- Privacy runs BEFORE strict validation -----------------------------------

test("an unknown field naming a person → privacy error", () => {
  assert.throws(
    () => parseCompanyEnrichmentOutput({ ...VALID, founder: "Jan Kowalski" }),
    CompanyEnrichmentPrivacyError,
  );
});

test("an email VALUE inside the description → privacy error (before strict)", () => {
  assert.throws(
    () => parseCompanyEnrichmentOutput({ ...VALID, description: "Kontakt: biuro@przyklad.example" }),
    CompanyEnrichmentPrivacyError,
  );
});

test("a role + person-name phrase inside an array item → privacy error", () => {
  assert.throws(
    () => parseCompanyEnrichmentOutput({ ...VALID, productsServices: ["Prezes: Jan Kowalski"] }),
    CompanyEnrichmentPrivacyError,
  );
});

// --- Strict validation errors -------------------------------------------------

test("an unknown benign field → invalid-response error", () => {
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, foo: "bar" }), InvalidCompanyEnrichmentResponseError);
});

test("each required field missing independently → invalid-response error", () => {
  for (const key of Object.keys(VALID)) {
    const clone: Record<string, unknown> = { ...VALID };
    delete clone[key];
    assert.throws(() => parseCompanyEnrichmentOutput(clone), InvalidCompanyEnrichmentResponseError, `missing ${key}`);
  }
});

test("a wrong scalar type → invalid-response error", () => {
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, industry: 42 }), InvalidCompanyEnrichmentResponseError);
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, foundedYear: "2010" }), InvalidCompanyEnrichmentResponseError);
});

test("an implausible foundedYear → invalid-response error", () => {
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, foundedYear: 1500 }), InvalidCompanyEnrichmentResponseError);
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, foundedYear: 3000 }), InvalidCompanyEnrichmentResponseError);
});

// --- Tolerant website handling (an invalid/messy website must never discard
// --- the rest of an otherwise-valid enrichment result) ----------------------

test("a website with a path/query/fragment is reduced to its origin — the rest of the result is kept", () => {
  const parsed = parseCompanyEnrichmentOutput({
    ...VALID,
    website: "https://przyklad.example/o-nas?tab=1#top",
  });
  assert.equal(parsed.website, "https://przyklad.example");
  assert.equal(parsed.description, VALID.description);
  assert.deepEqual(parsed.productsServices, VALID.productsServices);
});

test("a website with a trailing slash is reduced to its origin — the rest of the result is kept", () => {
  const parsed = parseCompanyEnrichmentOutput({ ...VALID, website: "https://przyklad.example/" });
  assert.equal(parsed.website, "https://przyklad.example");
});

test("a website missing its scheme cannot be safely normalized → becomes null, other facts kept", () => {
  const parsed = parseCompanyEnrichmentOutput({ ...VALID, website: "przyklad.example" });
  assert.equal(parsed.website, null);
  assert.equal(parsed.description, VALID.description);
  assert.equal(parsed.industry, VALID.industry);
  assert.deepEqual(parsed.productsServices, VALID.productsServices);
});

test("a website pointing at an IP literal cannot be safely normalized → becomes null, other facts kept", () => {
  const parsed = parseCompanyEnrichmentOutput({ ...VALID, website: "http://127.0.0.1" });
  assert.equal(parsed.website, null);
  assert.equal(parsed.description, VALID.description);
});

test("a completely unparseable website string cannot be safely normalized → becomes null, other facts kept", () => {
  const parsed = parseCompanyEnrichmentOutput({ ...VALID, website: "not a url at all" });
  assert.equal(parsed.website, null);
  assert.deepEqual(parsed.operatingMarkets, VALID.operatingMarkets);
});

test("an excessive item length → invalid-response error (never truncated)", () => {
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, productsServices: ["x".repeat(200)] }), InvalidCompanyEnrichmentResponseError);
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, description: "x".repeat(600) }), InvalidCompanyEnrichmentResponseError);
});

test("an excessive array count → invalid-response error (never truncated)", () => {
  const tooMany = Array.from({ length: 9 }, (_, i) => `p${i}`);
  assert.throws(() => parseCompanyEnrichmentOutput({ ...VALID, productsServices: tooMany }), InvalidCompanyEnrichmentResponseError);
});

test("invalid JSON string → invalid-response error", () => {
  assert.throws(() => parseCompanyEnrichmentOutput("not json {"), InvalidCompanyEnrichmentResponseError);
});

test("a non-object value → invalid-response error", () => {
  assert.throws(() => parseCompanyEnrichmentOutput(JSON.stringify([1, 2])), InvalidCompanyEnrichmentResponseError);
});
