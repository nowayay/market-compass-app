import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoPersonalData,
  PersonalDataLeakError,
} from "../privacy/assertNoPersonalData.ts";

test("passes for company-only data", () => {
  assert.doesNotThrow(() =>
    assertNoPersonalData({
      identity: { legalName: "X", identifiers: { krs: "0000123456" } },
      location: { city: "Warszawa", countryCode: "PL" },
    }),
  );
});

test("throws when a person-related key is present", () => {
  assert.throws(
    () => assertNoPersonalData({ identity: { legalName: "X" }, boardMembers: [] }),
    PersonalDataLeakError,
  );
  assert.throws(
    () => assertNoPersonalData({ reprezentacja: { sklad: [] } }),
    PersonalDataLeakError,
  );
  assert.throws(
    () => assertNoPersonalData({ nested: { nazwisko: "anything" } }),
    PersonalDataLeakError,
  );
});

test("throws on a PESEL-shaped value", () => {
  assert.throws(
    () => assertNoPersonalData({ note: "id 12345678901 here" }),
    PersonalDataLeakError,
  );
});
