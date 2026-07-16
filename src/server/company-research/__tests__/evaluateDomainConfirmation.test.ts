import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateDomainConfirmation,
  unavailableConfirmationResult,
} from "../domain-confirmation/evaluateDomainConfirmation.ts";
import { normalizeFoundIdentifiers } from "../domain-confirmation/schema.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import type {
  DomainConfirmationStatus,
  ExpectedCompanyIdentifiers,
  NormalizedFoundIdentifiers,
} from "../domain-confirmation/types.ts";

const ORIGIN = "https://company.example";

const EXPECTED: ExpectedCompanyIdentifiers = {
  krs: "0000123456",
  nip: "1234563218",
  regon: "123456785",
};

function found(o: Partial<NormalizedFoundIdentifiers> = {}): NormalizedFoundIdentifiers {
  return {
    krs: [],
    nip: [],
    regon: [],
    malformedKrs: false,
    malformedNip: false,
    malformedRegon: false,
    ...o,
  };
}

const evalWith = (
  f: NormalizedFoundIdentifiers,
  sources: string[] = [ORIGIN],
  expected: ExpectedCompanyIdentifiers = EXPECTED,
) => evaluateDomainConfirmation(expected, f, sources, ORIGIN);

// Compile-time guard: only the three documented statuses exist.
// @ts-expect-error — "probable" is not a confirmation status.
const _noProbable: DomainConfirmationStatus = "probable";
void _noProbable;

// (21) exact KRS match confirms
test("exact KRS match with an on-domain source → confirmed", () => {
  const r = evalWith(found({ krs: ["0000123456"] }));
  assert.equal(r.status, "confirmed");
  assert.equal(r.confirmedOrigin, ORIGIN);
  assert.deepEqual(r.verifiedIdentifiers, ["krs"]);
  assert.ok(r.reasons.includes("KRS_IDENTIFIER_VERIFIED"));
});

// (22) exact NIP match confirms
test("exact NIP match → confirmed", () => {
  const r = evalWith(found({ nip: ["1234563218"] }));
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.verifiedIdentifiers, ["nip"]);
});

// (23) exact REGON match confirms
test("exact REGON match → confirmed", () => {
  const r = evalWith(found({ regon: ["123456785"] }));
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.verifiedIdentifiers, ["regon"]);
});

// (24) no identifier found → unverified
test("no identifiers found → unverified", () => {
  const r = evalWith(found());
  assert.equal(r.status, "unverified");
  assert.equal(r.confirmedOrigin, null);
  assert.deepEqual(r.verifiedIdentifiers, []);
  assert.ok(r.reasons.includes("NO_INDEPENDENT_IDENTIFIER"));
});

// (25) malformed only → unverified
test("only a malformed identifier → unverified (and never confirmed)", () => {
  const r = evalWith(found({ malformedNip: true }));
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("MALFORMED_NIP_VALUE"));
  assert.deepEqual(r.conflicts, []);
});

test("a valid match alongside ANY malformed value cannot confirm", () => {
  const r = evalWith(found({ nip: ["1234563218"], malformedKrs: true }));
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("MALFORMED_KRS_VALUE"));
});

// (26/27/28) mismatching identifier conflicts
test("mismatching KRS → conflict", () => {
  const r = evalWith(found({ krs: ["9999999999"] }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.conflicts, ["KRS_CONFLICT"]);
  assert.equal(r.confirmedOrigin, null);
});

test("mismatching NIP → conflict", () => {
  const r = evalWith(found({ nip: ["9999999990"] }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.conflicts, ["NIP_CONFLICT"]);
});

test("mismatching REGON → conflict", () => {
  const r = evalWith(found({ regon: ["999999990"] }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.conflicts, ["REGON_CONFLICT"]);
});

// (29) one matching and one conflicting value → conflict (conflict always wins)
test("one matching + one conflicting value of the same identifier → conflict", () => {
  const r = evalWith(found({ nip: ["1234563218", "9999999990"] }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.conflicts, ["NIP_CONFLICT"]);
  // conflict wins even though a match existed → no confirmed origin / verified ids
  assert.equal(r.confirmedOrigin, null);
  assert.deepEqual(r.verifiedIdentifiers, []);
});

test("a conflict on one identifier wins over a clean match on another", () => {
  const r = evalWith(found({ nip: ["1234563218"], krs: ["9999999999"] }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.conflicts, ["KRS_CONFLICT"]);
});

// (30) missing provider-attested source prevents confirmation
test("a matching identifier with NO valid source → unverified", () => {
  const r = evalWith(found({ nip: ["1234563218"] }), []);
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("NO_ATTESTED_SOURCE"));
});

// (32) a match not backed by an on-domain source (mere echo / hallucination) cannot confirm
test("a matching identifier backed only by an OFF-domain source cannot confirm", () => {
  const r = evalWith(found({ nip: ["1234563218"] }), ["https://aggregator.example"]);
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("NO_ATTESTED_SOURCE"));
  assert.deepEqual(r.sourceOrigins, []);
});

test("an arbitrary subdomain source is not a valid on-target source", () => {
  const r = evalWith(found({ nip: ["1234563218"] }), ["https://blog.company.example"]);
  assert.equal(r.status, "unverified");
  assert.deepEqual(r.sourceOrigins, []);
});

// (H) no comparable expected identifier → cannot verify or conflict
test("a found identifier with NO expected counterpart neither verifies nor conflicts", () => {
  const r = evalWith(found({ nip: ["1234563218"] }), [ORIGIN], {
    krs: null,
    nip: null,
    regon: null,
  });
  assert.equal(r.status, "unverified");
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.verifiedIdentifiers, []);
});

test("result carries only origins + enum codes and passes the privacy guard", () => {
  const r = evalWith(found({ nip: ["1234563218"] }));
  assert.doesNotThrow(() => assertNoPersonalData(r, "domainConfirmationResult"));
});

// --- Evidence-oriented found-KRS safety (no left-padding) --------------------

test("a found '1' cannot match an expected '0000000001' (stays unverified)", () => {
  // "1" is malformed found evidence — it is never padded, never verifies.
  const found = normalizeFoundIdentifiers({ krs: ["1"], nip: [], regon: [] });
  const r = evaluateDomainConfirmation(
    { krs: "0000000001", nip: null, regon: null },
    found,
    [ORIGIN],
    ORIGIN,
  );
  assert.equal(r.status, "unverified");
  assert.notEqual(r.status, "confirmed");
  assert.deepEqual(r.verifiedIdentifiers, []);
  assert.ok(r.reasons.includes("MALFORMED_KRS_VALUE"));
});

test("a malformed short found KRS with a valid on-domain source stays unverified", () => {
  const found = normalizeFoundIdentifiers({ krs: ["123456"], nip: [], regon: [] });
  const r = evaluateDomainConfirmation(
    { krs: "0000123456", nip: null, regon: null },
    found,
    [ORIGIN],
    ORIGIN,
  );
  assert.equal(r.status, "unverified");
  assert.ok(r.reasons.includes("MALFORMED_KRS_VALUE"));
  assert.deepEqual(r.conflicts, []);
});

test("an exact 10-digit found KRS with a valid on-domain source confirms", () => {
  const found = normalizeFoundIdentifiers({ krs: ["0000123456"], nip: [], regon: [] });
  const r = evaluateDomainConfirmation(
    { krs: "0000123456", nip: null, regon: null },
    found,
    [ORIGIN],
    ORIGIN,
  );
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.verifiedIdentifiers, ["krs"]);
});

test("a spaced/hyphenated exact-10-digit found KRS confirms; expected may still pad", () => {
  // Found evidence is strict (exact 10, separators allowed); the EXPECTED backend
  // KRS may still normalize via the padding policy ("123456" → "0000123456").
  const found = normalizeFoundIdentifiers({ krs: ["0000 123 456"], nip: [], regon: [] });
  const r = evaluateDomainConfirmation(
    { krs: "123456", nip: null, regon: null },
    found,
    [ORIGIN],
    ORIGIN,
  );
  assert.equal(r.status, "confirmed");
  assert.deepEqual(r.verifiedIdentifiers, ["krs"]);
});

test("unavailableConfirmationResult is a fail-closed unverified result", () => {
  const r = unavailableConfirmationResult();
  assert.equal(r.status, "unverified");
  assert.equal(r.confirmedOrigin, null);
  assert.deepEqual(r.verifiedIdentifiers, []);
  assert.deepEqual(r.reasons, ["CONFIRMATION_UNAVAILABLE"]);
});
