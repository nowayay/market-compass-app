import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCandidateId,
  isValidCandidateId,
  parseCandidateId,
} from "../identification/candidateId.ts";

test("createCandidateId uses the cmp_pl_krs_<10digits> format", () => {
  assert.equal(createCandidateId("0000123456"), "cmp_pl_krs_0000123456");
});

test("createCandidateId is deterministic and order-independent", () => {
  assert.equal(createCandidateId("0000123456"), createCandidateId("0000123456"));
});

test("parseCandidateId round-trips a valid PL id", () => {
  assert.deepEqual(parseCandidateId("cmp_pl_krs_0000123456"), { countryCode: "PL", krs: "0000123456" });
});

test("only Poland is accepted — other country codes are rejected", () => {
  for (const bad of ["cmp_de_krs_0000123456", "cmp_us_krs_0000123456", "cmp_PL_krs_0000123456"]) {
    assert.equal(parseCandidateId(bad), null, bad);
    assert.equal(isValidCandidateId(bad), false, bad);
  }
});

test("rejects malformed ids (bad length, extra affixes, non-digits)", () => {
  for (const bad of [
    "cand_1",
    "cmp_pl_krs_123", // too few digits
    "cmp_pl_krs_00001234567", // too many digits
    "cmp_pl_nip_0000123456", // wrong identifier kind
    "x_cmp_pl_krs_0000123456", // prefix
    "cmp_pl_krs_0000123456_x", // suffix
    "CMP_PL_KRS_0000123456", // uppercase
    "cmp_pl_krs_00001234ab",
    "",
  ]) {
    assert.equal(parseCandidateId(bad), null, bad);
    assert.equal(isValidCandidateId(bad), false, bad);
  }
});

test("isValidCandidateId accepts a well-formed PL id", () => {
  assert.equal(isValidCandidateId("cmp_pl_krs_0000123456"), true);
});
