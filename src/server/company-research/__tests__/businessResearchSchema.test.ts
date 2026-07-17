import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_RESEARCH_JSON_SCHEMA,
  parseBusinessResearchOutput,
} from "../business-research/schema.ts";
import {
  BusinessResearchPrivacyError,
  InvalidBusinessResearchResponseError,
} from "../business-research/errors.ts";

const schema = BUSINESS_RESEARCH_JSON_SCHEMA as {
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, { type: unknown; maxItems?: number; maxLength?: number; items?: { maxLength?: number; enum?: string[] } }>;
};

/** A structurally valid, personal-data-free raw model output. */
const VALID = {
  industryDescription: "Custom software development",
  productsServices: ["Web applications"],
  customerSegments: ["SMEs"],
  operatingMarkets: ["Poland"],
  ambiguityCodes: [] as string[],
};

// --- Strict JSON Schema shape ------------------------------------------------

test("schema is strict: additionalProperties false, all five fields required", () => {
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required.slice().sort(), [
    "ambiguityCodes",
    "customerSegments",
    "industryDescription",
    "operatingMarkets",
    "productsServices",
  ]);
});

test("schema exposes no URL/citation/source/confidence/person/narrative fields", () => {
  const dump = JSON.stringify(schema);
  for (const forbidden of [
    "url", "citation", "sourceId", "confidence", "explanation", "recommendation",
    "swot", "ranking", "salesChannels", "revenue", "employees", "owner", "founder",
    "board", "representative", "contactPerson", "email", "phone", "pesel", "social",
    "snippet", "pageContent",
  ]) {
    assert.ok(!dump.includes(forbidden), `schema exposes forbidden: ${forbidden}`);
  }
});

test("schema enforces item counts and per-item lengths", () => {
  assert.equal(schema.properties.industryDescription.maxLength, 160);
  assert.equal(schema.properties.productsServices.maxItems, 12);
  assert.equal(schema.properties.productsServices.items?.maxLength, 120);
  assert.equal(schema.properties.customerSegments.maxItems, 8);
  assert.equal(schema.properties.operatingMarkets.maxItems, 12);
  assert.ok(Array.isArray(schema.properties.ambiguityCodes.items?.enum));
});

// --- The real parser: valid inputs -------------------------------------------

test("a valid object parses unchanged (no removal/substitution/truncation)", () => {
  assert.deepEqual(parseBusinessResearchOutput(VALID), { ...VALID });
});

test("null industryDescription and empty arrays are accepted", () => {
  const parsed = parseBusinessResearchOutput({
    industryDescription: null,
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
    ambiguityCodes: [],
  });
  assert.equal(parsed.industryDescription, null);
  assert.deepEqual(parsed.productsServices, []);
});

test("all allowed ambiguity codes parse", () => {
  const parsed = parseBusinessResearchOutput({ ...VALID, ambiguityCodes: ["multiple_legal_entities", "contradictory_markets"] });
  assert.deepEqual(parsed.ambiguityCodes, ["multiple_legal_entities", "contradictory_markets"]);
});

// --- Privacy runs BEFORE strict validation (A.1–A.3) -------------------------

test("(1) an unknown contactPerson field with a person name → privacy error", () => {
  assert.throws(
    () => parseBusinessResearchOutput({ ...VALID, contactPerson: "Jan Kowalski" }),
    BusinessResearchPrivacyError,
  );
});

test("(2) an unknown email field → privacy error", () => {
  assert.throws(
    () => parseBusinessResearchOutput({ ...VALID, email: "info@example.com" }),
    BusinessResearchPrivacyError,
  );
});

test("(3) a person/contact object nested inside an array → privacy error", () => {
  assert.throws(
    () => parseBusinessResearchOutput({ ...VALID, productsServices: [{ firstName: "Jan", lastName: "Kowalski" }] }),
    BusinessResearchPrivacyError,
  );
});

test("an email VALUE inside a valid array item → privacy error (before strict)", () => {
  assert.throws(
    () => parseBusinessResearchOutput({ ...VALID, productsServices: ["Contact info@example.com"] }),
    BusinessResearchPrivacyError,
  );
});

// --- Strict validation errors (A.4–A.10) -------------------------------------

test("(4) an unknown benign field → invalid-response error", () => {
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, foo: "bar" }), InvalidBusinessResearchResponseError);
});

test("(5) each required field missing independently → invalid-response error", () => {
  for (const key of Object.keys(VALID)) {
    const clone: Record<string, unknown> = { ...VALID };
    delete clone[key];
    assert.throws(() => parseBusinessResearchOutput(clone), InvalidBusinessResearchResponseError, `missing ${key}`);
  }
});

test("(6) a wrong industryDescription scalar type → invalid-response error", () => {
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, industryDescription: 42 }), InvalidBusinessResearchResponseError);
});

test("(7) non-string array items → invalid-response error", () => {
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, productsServices: ["ok", 5] }), InvalidBusinessResearchResponseError);
});

test("(8) an excessive item length → invalid-response error (never truncated)", () => {
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, productsServices: ["x".repeat(200)] }), InvalidBusinessResearchResponseError);
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, industryDescription: "x".repeat(200) }), InvalidBusinessResearchResponseError);
});

test("(9) an excessive array count → invalid-response error (never truncated)", () => {
  const tooMany = Array.from({ length: 13 }, (_, i) => `p${i}`);
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, productsServices: tooMany }), InvalidBusinessResearchResponseError);
});

test("(10) an unknown ambiguity code → invalid-response error (never filtered)", () => {
  assert.throws(() => parseBusinessResearchOutput({ ...VALID, ambiguityCodes: ["not_a_real_code"] }), InvalidBusinessResearchResponseError);
  assert.throws(
    () => parseBusinessResearchOutput({ ...VALID, ambiguityCodes: ["multiple_legal_entities", "bogus"] }),
    InvalidBusinessResearchResponseError,
  );
});

test("invalid JSON string → invalid-response error", () => {
  assert.throws(() => parseBusinessResearchOutput("not json {"), InvalidBusinessResearchResponseError);
});

test("a non-object value → invalid-response error", () => {
  assert.throws(() => parseBusinessResearchOutput(JSON.stringify([1, 2])), InvalidBusinessResearchResponseError);
});
