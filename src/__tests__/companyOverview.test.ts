/**
 * Focused MVP tests for `deriveCompanyOverview`: the pure helper that turns
 * the flat `DashboardCompanyInfo` into the optional metadata/registry rows the
 * top dashboard card renders. Covers both a fully-populated company and the
 * "omit absent fields, never show a placeholder" requirement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveCompanyOverview } from "../lib/companyOverview.ts";
import type { DashboardCompanyInfo } from "../types.ts";

function fullCompany(): DashboardCompanyInfo {
  return {
    legalName: "Przykładowa Spółka Sp. z o.o.",
    krs: "0000123456",
    nip: "5270000000",
    regon: "142000000",
    foundedYear: 2005,
    website: "https://przyklad.example",
    industry: "Oprogramowanie",
    description: "Firma tworzy oprogramowanie na zamówienie.",
    productsServices: ["Aplikacje webowe"],
    customerSegments: ["MŚP"],
    operatingMarkets: ["Polska"],
  };
}

function legalOnlyCompany(): DashboardCompanyInfo {
  return {
    legalName: "Przykładowa Spółka Sp. z o.o.",
    krs: "0000123456",
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
  };
}

test("(overview) a fully-populated company derives all metadata and registry items", () => {
  const overview = deriveCompanyOverview(fullCompany());
  assert.equal(overview.description, "Firma tworzy oprogramowanie na zamówienie.");
  assert.deepEqual(overview.metadata, [
    { label: "Branża", value: "Oprogramowanie" },
    { label: "Rok założenia", value: "2005" },
    { label: "Strona internetowa", value: "https://przyklad.example", isLink: true },
  ]);
  assert.deepEqual(overview.registry, [
    { label: "KRS", value: "0000123456" },
    { label: "NIP", value: "5270000000" },
    { label: "REGON", value: "142000000" },
  ]);
});

test("(overview) empty optional fields are omitted, never shown as placeholders", () => {
  const overview = deriveCompanyOverview(legalOnlyCompany());
  assert.equal(overview.description, undefined);
  assert.deepEqual(overview.metadata, []);
  assert.deepEqual(overview.registry, [{ label: "KRS", value: "0000123456" }]);
});

test("(overview) partially-populated companies include only the present fields", () => {
  const overview = deriveCompanyOverview({
    legalName: "Test",
    nip: "5270000000",
    industry: "Handel",
    productsServices: [],
    customerSegments: [],
    operatingMarkets: [],
  });
  assert.deepEqual(overview.metadata, [{ label: "Branża", value: "Handel" }]);
  assert.deepEqual(overview.registry, [{ label: "NIP", value: "5270000000" }]);
});

test("(overview) a foundedYear of 0 is falsy and correctly omitted (never a real founding year)", () => {
  const overview = deriveCompanyOverview({ ...legalOnlyCompany(), foundedYear: 0 });
  assert.deepEqual(overview.metadata, []);
});
