import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessEvidenceId,
  businessItemId,
  businessSourceId,
  shortHash,
} from "../business-research/ids.ts";
import { assertNoPersonalData, PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";

test("shortHash is deterministic and letters-only (no digits, so never phone-shaped)", () => {
  assert.equal(shortHash("abc"), shortHash("abc"));
  assert.notEqual(shortHash("abc"), shortHash("abd"));
  assert.match(shortHash("company.business.productsServices|Web applications"), /^[a-p]{16}$/);
});

// (F) a real generated itm_<hash> itemId passes the privacy guard WITHOUT any exemption
test("generated source/item/evidence ids pass the personal-data guard", () => {
  const itemId = businessItemId("company.business.productsServices", "Cloud hosting");
  const sourceId = businessSourceId("https://przyklad.example");
  const evidenceId = businessEvidenceId("company.business.productsServices", itemId);
  assert.match(itemId, /^itm_[a-p]{16}$/);
  assert.doesNotThrow(() =>
    assertNoPersonalData(
      { id: evidenceId, target: { path: "company.business.productsServices", itemId }, sourceIds: [sourceId] },
      "businessResearchResult",
    ),
  );
});

// (F) a phone-shaped itemId now fails (the exemption was removed)
test("a phone-shaped itemId fails with PHONE_NUMBER (no NUMERIC_SAFE_KEYS exemption)", () => {
  assert.throws(
    () => assertNoPersonalData({ itemId: "48 123 456 789" }, "businessResearchResult"),
    (e: unknown) => e instanceof PersonalDataLeakError && e.code === "PHONE_NUMBER",
  );
});

// (F) email / PESEL / personal-profile detection remains unchanged
test("email / PESEL / personal-profile detection is unchanged", () => {
  assert.throws(
    () => assertNoPersonalData({ note: "info@example.com" }),
    (e: unknown) => e instanceof PersonalDataLeakError && e.code === "EMAIL_ADDRESS",
  );
  assert.throws(
    () => assertNoPersonalData({ note: "12345678901" }),
    (e: unknown) => e instanceof PersonalDataLeakError && e.code === "PESEL",
  );
  assert.throws(
    () => assertNoPersonalData({ note: "https://www.linkedin.com/in/jan-kowalski" }),
    (e: unknown) => e instanceof PersonalDataLeakError && e.code === "PERSONAL_PROFILE_URL",
  );
});
