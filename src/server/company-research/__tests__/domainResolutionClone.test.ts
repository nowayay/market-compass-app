import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cloneDomainConfirmationResult,
  cloneEvaluatedDomainCandidate,
  cloneEvaluatedDomainCandidates,
} from "../domain-resolution/clone.ts";
import type { EvaluatedDomainCandidate } from "../domain-evaluation/types.ts";
import type { DomainConfirmationResult } from "../domain-confirmation/types.ts";

function candidate(): EvaluatedDomainCandidate {
  return {
    origin: "https://kowalski.example",
    domain: "kowalski.example",
    status: "probable",
    score: 100,
    reasons: ["NIP_DISCOVERY_SIGNAL_MATCH"],
    conflicts: [],
    sourceOrigins: ["https://kowalski.example"],
    signals: {
      matchedLegalName: "Jan Kowalski Consulting Sp. z o.o.",
      matchedKrs: null,
      matchedNip: "1234563218",
      matchedRegon: null,
      matchedCity: null,
    },
  };
}

function confirmation(): DomainConfirmationResult {
  return {
    status: "confirmed",
    confirmedOrigin: "https://kowalski.example",
    verifiedIdentifiers: ["nip"],
    reasons: ["NIP_IDENTIFIER_VERIFIED"],
    conflicts: [],
    sourceOrigins: ["https://kowalski.example"],
  };
}

test("cloneEvaluatedDomainCandidate preserves values but detaches every mutable field", () => {
  const source = candidate();
  const clone = cloneEvaluatedDomainCandidate(source);

  assert.deepEqual(clone, source); // semantically equal
  assert.notEqual(clone, source);
  assert.notEqual(clone.reasons, source.reasons);
  assert.notEqual(clone.conflicts, source.conflicts);
  assert.notEqual(clone.sourceOrigins, source.sourceOrigins);
  assert.notEqual(clone.signals, source.signals);

  // Mutating the clone never touches the source.
  clone.reasons.push("CITY_MATCH");
  clone.conflicts.push("KRS_CONFLICT");
  clone.sourceOrigins.push("https://x.example");
  clone.signals.matchedNip = "MUTATED";
  assert.deepEqual(source.reasons, ["NIP_DISCOVERY_SIGNAL_MATCH"]);
  assert.deepEqual(source.conflicts, []);
  assert.deepEqual(source.sourceOrigins, ["https://kowalski.example"]);
  assert.equal(source.signals.matchedNip, "1234563218");
});

test("cloneEvaluatedDomainCandidates detaches each entry independently", () => {
  const a = candidate();
  const b = candidate();
  const clones = cloneEvaluatedDomainCandidates([a, b]);
  assert.equal(clones.length, 2);
  assert.notEqual(clones[0], a);
  assert.notEqual(clones[1], b);
  assert.notEqual(clones[0].signals, clones[1].signals);
  clones[0].signals.matchedNip = "MUTATED";
  assert.equal(clones[1].signals.matchedNip, "1234563218");
  assert.equal(b.signals.matchedNip, "1234563218");
});

test("cloneDomainConfirmationResult preserves values but detaches every mutable field", () => {
  const source = confirmation();
  const clone = cloneDomainConfirmationResult(source);

  assert.deepEqual(clone, source);
  assert.notEqual(clone, source);
  assert.notEqual(clone.verifiedIdentifiers, source.verifiedIdentifiers);
  assert.notEqual(clone.reasons, source.reasons);
  assert.notEqual(clone.conflicts, source.conflicts);
  assert.notEqual(clone.sourceOrigins, source.sourceOrigins);

  clone.verifiedIdentifiers.push("krs");
  clone.reasons.push("NO_ATTESTED_SOURCE");
  clone.sourceOrigins.push("https://x.example");
  assert.deepEqual(source.verifiedIdentifiers, ["nip"]);
  assert.deepEqual(source.reasons, ["NIP_IDENTIFIER_VERIFIED"]);
  assert.deepEqual(source.sourceOrigins, ["https://kowalski.example"]);
});
