import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideIdentification,
  scoreCandidate,
  scoreCandidates,
} from "../identification/matchCompanyCandidates.ts";
import type { VerifiedCandidate } from "../identification/types.ts";
import type { KrsCompany, NormalizedQuery } from "../types.ts";

function krsCompany(legalName: string, extra: Partial<KrsCompany> = {}): KrsCompany {
  return {
    krs: "0000123456",
    legalName,
    countryCode: "PL",
    pkdSecondaryCodes: [],
    pkdLabels: [],
    retrievedAt: "2026-07-15T10:00:00.000Z",
    ...extra,
  };
}

function verified(
  legalName: string,
  opts: { foundedYear?: number; krsExtra?: Partial<KrsCompany> } = {},
): VerifiedCandidate {
  return {
    krsCompany: krsCompany(legalName, opts.krsExtra),
    discovered: { legalName, krs: "0000123456", countryCode: "PL", foundedYear: opts.foundedYear },
  };
}

const query = (name: string, foundedYear?: number): NormalizedQuery => ({ name, countryCode: "PL", foundedYear });

test("exact name match → 'exact' strength, no domain/founded reasons", () => {
  const scored = scoreCandidate(query("Przykładowa"), verified("PRZYKŁADOWA SPÓŁKA SP. Z O.O."), 0);
  assert.equal(scored.strength, "exact");
  assert.deepEqual(scored.matchReasons, [
    "Numer KRS potwierdzony w oficjalnym rejestrze",
    "Dokładna zgodność nazwy",
  ]);
  assert.equal(scored.confidence, 0.95);
});

test("disjoint name → 'weak' strength", () => {
  assert.equal(scoreCandidate(query("Zupełnie Inna"), verified("Alfa Handel"), 0).strength, "weak");
});

test("NO founded-year bonus, even when the query year matches the KRS registration year", () => {
  const withYear = scoreCandidate(
    query("Alfa", 2011),
    verified("Alfa", { krsExtra: { registrationDate: "2011.03.15" }, foundedYear: 2011 }),
    0,
  );
  const withoutYear = scoreCandidate(query("Alfa"), verified("Alfa"), 0);
  assert.equal(withYear.confidence, withoutYear.confidence); // no change
  assert.ok(!withYear.matchReasons.includes("Zgodność roku założenia"));
});

test("registration date is NOT treated as a founded year", () => {
  const scored = scoreCandidate(query("Alfa", 2011), verified("Alfa", { krsExtra: { registrationDate: "2011.03.15" } }), 0);
  assert.ok(!scored.matchReasons.some((r) => r.includes("roku założenia")));
});

test("source independence is counted by hostname and adds a small, capped bonus", () => {
  const base = scoreCandidate(query("Alfa"), verified("Alfa"), 0).confidence;
  const two = scoreCandidate(query("Alfa"), verified("Alfa"), 2).confidence;
  const five = scoreCandidate(query("Alfa"), verified("Alfa"), 5).confidence;
  assert.ok(two > base);
  assert.ok(five > two);
  assert.ok(five - base <= 0.04 + 1e-9); // bonus is capped
  const scored = scoreCandidate(query("Alfa"), verified("Alfa"), 2);
  assert.ok(scored.matchReasons.includes("Potwierdzenie w niezależnych źródłach internetowych"));
});

test("a single source gives no independence bonus", () => {
  const base = scoreCandidate(query("Alfa"), verified("Alfa"), 0).confidence;
  const one = scoreCandidate(query("Alfa"), verified("Alfa"), 1).confidence;
  assert.equal(one, base);
});

test("decision: no candidates → not_found", () => {
  assert.equal(decideIdentification([]), "not_found");
});

test("decision: single exact/strong → completed", () => {
  const scored = scoreCandidates(query("Przykładowa"), [verified("PRZYKŁADOWA SPÓŁKA SP. Z O.O.")], 0);
  assert.equal(decideIdentification(scored), "completed");
});

test("decision: single weak → needs_confirmation", () => {
  const scored = scoreCandidates(query("Zupełnie Inna"), [verified("Alfa Handel")], 0);
  assert.equal(decideIdentification(scored), "needs_confirmation");
});

test("decision: multiple → needs_confirmation", () => {
  const scored = scoreCandidates(query("Alfa"), [
    verified("Alfa", { krsExtra: { krs: "0000000001" } }),
    verified("Alfa Group", { krsExtra: { krs: "0000000002" } }),
  ], 0);
  assert.equal(decideIdentification(scored), "needs_confirmation");
});
