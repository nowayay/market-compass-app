import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyDescription,
  DESCRIPTION_MAX_LENGTH,
} from "../profile-assembly/description.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import type { StructuredBusinessFacts } from "../business-research/types.ts";

const NAME = "PRZYKŁADOWA SPÓŁKA SP. Z O.O.";

function facts(o: Partial<StructuredBusinessFacts> = {}): StructuredBusinessFacts {
  return {
    industryDescription: null,
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
    ...o,
  };
}

// (15) deterministic description with all categories.
test("all categories → full deterministic description", () => {
  const d = buildCompanyDescription(NAME, facts({
    industryDescription: "Tworzenie oprogramowania",
    productsServices: ["Aplikacje webowe"],
    customerSegments: ["MŚP"],
    operatingMarkets: ["Polska"],
  }));
  assert.equal(
    d.text,
    "PRZYKŁADOWA SPÓŁKA SP. Z O.O. — Tworzenie oprogramowania. Produkty i usługi: Aplikacje webowe. Klienci: MŚP. Rynki działalności: Polska.",
  );
});

// (16) industry only.
test("industry only → identity clause only", () => {
  const d = buildCompanyDescription(NAME, facts({ industryDescription: "Handel detaliczny" }));
  assert.equal(d.text, "PRZYKŁADOWA SPÓŁKA SP. Z O.O. — Handel detaliczny.");
  assert.equal(d.usedIndustry, true);
});

// (16) products only.
test("products only → identity + products", () => {
  const d = buildCompanyDescription(NAME, facts({ productsServices: ["Meble", "Krzesła"] }));
  assert.equal(d.text, "PRZYKŁADOWA SPÓŁKA SP. Z O.O. Produkty i usługi: Meble, Krzesła.");
});

// (16) partial business research (some categories).
test("partial categories → only present clauses", () => {
  const d = buildCompanyDescription(NAME, facts({
    productsServices: ["Meble"],
    operatingMarkets: ["Polska", "Czechy"],
  }));
  assert.equal(d.text, "PRZYKŁADOWA SPÓŁKA SP. Z O.O. Produkty i usługi: Meble. Rynki działalności: Polska, Czechy.");
});

// (17) no accepted business facts → no description (legal name alone is not enough).
test("no accepted business facts → absent description", () => {
  const d = buildCompanyDescription(NAME, facts());
  assert.equal(d.text, null);
});

// (18) list limits + non-exhaustive marker (never claims the sample is complete).
test("long lists are capped and marked non-exhaustive", () => {
  const d = buildCompanyDescription(NAME, facts({
    productsServices: ["P1", "P2", "P3", "P4", "P5"],
    customerSegments: ["S1", "S2", "S3"],
    operatingMarkets: ["M1", "M2", "M3", "M4"],
  }));
  assert.ok(d.text);
  assert.ok(d.text!.includes("Produkty i usługi: P1, P2, P3 i inne"));
  assert.ok(d.text!.includes("Klienci: S1, S2 i inne"));
  assert.ok(d.text!.includes("Rynki działalności: M1, M2, M3 i inne"));
  assert.deepEqual(d.usedProducts, ["P1", "P2", "P3"]);
  assert.deepEqual(d.usedSegments, ["S1", "S2"]);
});

// (18) hard length limit, truncating only at sentence boundaries.
test("description length limit truncates whole clauses only", () => {
  const long = "x".repeat(150);
  const d = buildCompanyDescription(NAME, facts({
    industryDescription: long.slice(0, 120),
    productsServices: [long.slice(0, 100), long.slice(0, 100)],
    customerSegments: [long.slice(0, 90), long.slice(0, 90)],
    operatingMarkets: [long.slice(0, 70), long.slice(0, 70)],
  }));
  assert.ok(d.text);
  assert.ok(d.text!.length <= DESCRIPTION_MAX_LENGTH);
  // Every kept sentence ends with a period (no mid-sentence cut).
  for (const sentence of d.text!.split(". ")) {
    assert.ok(sentence.length > 0);
  }
  assert.ok(d.text!.endsWith("."));
});

// (duplicate facts) case-insensitive dedupe, first spelling preserved.
test("duplicate facts are de-duplicated deterministically", () => {
  const d = buildCompanyDescription(NAME, facts({
    productsServices: ["Meble", "meble", "MEBLE", "Krzesła"],
  }));
  assert.equal(d.text, "PRZYKŁADOWA SPÓŁKA SP. Z O.O. Produkty i usługi: Meble, Krzesła.");
});

// (19) description contains no identifiers, URLs or person data.
test("description leaks no identifiers, URLs or person data", () => {
  const d = buildCompanyDescription("Jan Kowalski Consulting Sp. z o.o.", facts({
    industryDescription: "Doradztwo biznesowe",
    productsServices: ["Audyt", "Szkolenia"],
    customerSegments: ["Korporacje"],
    operatingMarkets: ["Polska"],
  }));
  assert.ok(d.text);
  assert.ok(!/\bhttps?:\/\//.test(d.text!));
  assert.ok(!/\d{9,}/.test(d.text!)); // no KRS/NIP/REGON/phone-length digit runs
  assert.doesNotThrow(() => assertNoPersonalData(d.text, "company.business.description"));
});

// (deterministic repeated execution) identical output every time.
test("repeated execution is byte-for-byte identical", () => {
  const input = facts({
    industryDescription: "Logistyka",
    productsServices: ["Transport", "Magazynowanie"],
    customerSegments: ["E-commerce"],
    operatingMarkets: ["Polska", "Niemcy", "Czechy"],
  });
  const a = buildCompanyDescription(NAME, input);
  const b = buildCompanyDescription(NAME, input);
  assert.deepEqual(a, b);
});

// person-like legal name is used verbatim as the framing legal name.
test("person-like legal name is used as the company legal name", () => {
  const d = buildCompanyDescription("Anna Nowak Design Sp. z o.o.", facts({ productsServices: ["Grafika"] }));
  assert.ok(d.text?.startsWith("Anna Nowak Design Sp. z o.o."));
  assert.doesNotThrow(() => assertNoPersonalData(d.text, "company.business.description"));
});

// (H) sentence termination handles existing terminal marks + closing punctuation.
// The full expected description string (identity clause + one products clause) is
// asserted, not only an extracted identity clause.
const terminationCases: Array<[string, string]> = [
  ["Alfa.", "Alfa."],
  ["Alfa!", "Alfa!"],
  ["Alfa?", "Alfa?"],
  ['Alfa."', 'Alfa."'],
  ["Alfa!”", "Alfa!”"],
  ["Alfa?»", "Alfa?»"],
  ["Alfa.)", "Alfa.)"],
  ["Alfa.]", "Alfa.]"],
  ['Alfa"', 'Alfa."'],
  ["Alfa)", "Alfa.)"],
  ["Alfa]", "Alfa.]"],
];
for (const [name, expectedIdentity] of terminationCases) {
  test(`H: identity clause ending in "${name}" terminates cleanly`, () => {
    const d = buildCompanyDescription(name, facts({ productsServices: ["X"] }));
    assert.equal(d.text, `${expectedIdentity} Produkty i usługi: X.`);
    assert.ok(!d.text!.includes(".."));
    assert.ok(!d.text!.includes("!."));
    assert.ok(!d.text!.includes("?."));
  });
}

// (E) identity/industry clause alone over the limit → the whole description is absent.
test("E: identity clause longer than 600 → absent description (helper)", () => {
  const d = buildCompanyDescription("A".repeat(650), facts({ productsServices: ["X"] }));
  assert.equal(d.text, null);
});

// (E) a later oversized clause is omitted at a complete sentence boundary.
test("E: a later oversized clause is dropped, earlier clauses kept", () => {
  const d = buildCompanyDescription("Krótka Nazwa", facts({
    industryDescription: "Usługi",
    productsServices: ["P"],
    operatingMarkets: ["M".repeat(70), "N".repeat(70), "O".repeat(70), "Q".repeat(70), "R".repeat(70), "S".repeat(70)],
  }));
  assert.ok(d.text);
  assert.ok(d.text!.length <= DESCRIPTION_MAX_LENGTH);
  assert.ok(d.text!.startsWith("Krótka Nazwa — Usługi."));
  assert.ok(d.text!.endsWith("."));
});
