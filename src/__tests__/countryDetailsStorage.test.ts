/**
 * Tests for the per-country deep-dive browser cache: key format (KRS + country
 * code), save/load roundtrip, casing normalization, and rejecting a
 * tampered/malformed stored value instead of trusting it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countryDetailsKey,
  loadCountryDetails,
  saveCountryDetails,
} from "../lib/countryDetailsStorage.ts";
import type { CountryDetails } from "../contracts/countryDetails.ts";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, value); }
}

function fakeDetails(): CountryDetails {
  return {
    scoreRationale: "Uzasadnienie oceny.",
    opportunities: ["a", "b", "c", "d"],
    risks: ["e", "f", "g", "h"],
    customerSegments: ["s1", "s2", "s3"],
    competition: "Konkurencja.",
    entryModel: "Model wejścia.",
    barriers: ["b1", "b2", "b3"],
    firstSteps: ["k1", "k2", "k3"],
    confidenceLevel: "high",
    confidenceRationale: "Uzasadnienie pewności.",
  };
}

test("(cache) the key is namespaced by KRS and uppercased country code", () => {
  assert.equal(countryDetailsKey("0000123456", "de"), "marketcompass_country_details_v1:0000123456:DE");
});

test("(cache) a missing KRS falls back to a stable 'unknown' bucket", () => {
  assert.equal(countryDetailsKey(undefined, "US"), "marketcompass_country_details_v1:unknown:US");
});

test("(cache) save then load round-trips the details", () => {
  const storage = new MemoryStorage();
  const details = fakeDetails();
  saveCountryDetails("0000123456", "DE", details, storage);
  assert.deepEqual(loadCountryDetails("0000123456", "DE", storage), details);
});

test("(cache) load is casing-insensitive on the country code", () => {
  const storage = new MemoryStorage();
  saveCountryDetails("0000123456", "DE", fakeDetails(), storage);
  assert.notEqual(loadCountryDetails("0000123456", "de", storage), null);
});

test("(cache) load returns null when nothing is stored", () => {
  assert.equal(loadCountryDetails("0000123456", "FR", new MemoryStorage()), null);
});

test("(cache) a tampered / malformed stored value is rejected, never trusted", () => {
  const storage = new MemoryStorage();
  storage.setItem(countryDetailsKey("0000123456", "DE"), JSON.stringify({ opportunities: ["only-one"] }));
  assert.equal(loadCountryDetails("0000123456", "DE", storage), null);
});

test("(cache) entries for different countries do not collide", () => {
  const storage = new MemoryStorage();
  const de = fakeDetails();
  const fr = { ...fakeDetails(), competition: "Inny rynek." };
  saveCountryDetails("0000123456", "DE", de, storage);
  saveCountryDetails("0000123456", "FR", fr, storage);
  assert.equal(loadCountryDetails("0000123456", "DE", storage)?.competition, "Konkurencja.");
  assert.equal(loadCountryDetails("0000123456", "FR", storage)?.competition, "Inny rynek.");
});
