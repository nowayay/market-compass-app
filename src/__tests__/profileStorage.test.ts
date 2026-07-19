/**
 * Focused tests for multi-profile localStorage persistence: save/load
 * round-trip (including rejecting tampered/malformed data), one-time
 * migration from the legacy single-dashboard slot, upserting by company KRS
 * (adding a new profile vs. updating an existing one in place), removal, and
 * selecting a stored profile by its stable id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROFILES_STORAGE_KEY,
  loadProfiles,
  profileKeyOf,
  removeProfile,
  saveProfiles,
  upsertProfile,
} from "../lib/profileStorage.ts";
import { DASHBOARD_STORAGE_KEY } from "../lib/dashboardStorage.ts";
import type { CompanyProfileEntry, DashboardCompletedResponse } from "../types.ts";

/** A minimal in-memory `Storage` implementation for a plain Node test. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function fakeDashboard(overrides: Partial<DashboardCompletedResponse["company"]> = {}): DashboardCompletedResponse {
  return {
    status: "completed",
    requestId: "req_1",
    query: { name: "Test Sp. z o.o.", countryCode: "PL" },
    company: {
      legalName: "Test Sp. z o.o.",
      krs: "0000123456",
      productsServices: [],
      customerSegments: [],
      operatingMarkets: [],
      ...overrides,
    },
    expansion: {
      swot: { strengths: ["a"], weaknesses: ["b"], opportunities: ["c"], threats: ["d"] },
      rankedCountries: [
        { countryCode: "DE", countryName: "Niemcy", score: 80, summary: "s", opportunities: [], risks: [] },
        { countryCode: "FR", countryName: "Francja", score: 70, summary: "s", opportunities: [], risks: [] },
        { countryCode: "US", countryName: "USA", score: 60, summary: "s", opportunities: [], risks: [] },
        { countryCode: "GB", countryName: "UK", score: 50, summary: "s", opportunities: [], risks: [] },
        { countryCode: "NL", countryName: "Holandia", score: 40, summary: "s", opportunities: [], risks: [] },
      ],
    },
    sources: [],
  };
}

function entry(id: string, savedAt: string, companyOverrides: Partial<DashboardCompletedResponse["company"]> = {}): CompanyProfileEntry {
  return { id, savedAt, dashboard: fakeDashboard({ krs: id, ...companyOverrides }) };
}

// ---- localStorage: save/load round-trip + tamper rejection ----

test("(localStorage) loadProfiles returns an empty list when nothing is stored", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(loadProfiles(storage), []);
});

test("(localStorage) saveProfiles then loadProfiles restores the exact list", () => {
  const storage = new MemoryStorage();
  const e = entry("0000123456", "2026-07-01T10:00:00.000Z");
  saveProfiles([e], storage);
  assert.deepEqual(loadProfiles(storage), [e]);
  assert.ok(storage.getItem(PROFILES_STORAGE_KEY));
});

test("(localStorage) a tampered/malformed stored entry is dropped, not trusted", () => {
  const storage = new MemoryStorage();
  storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify([{ id: "x", savedAt: "y", dashboard: { not: "a valid dashboard" } }]));
  assert.deepEqual(loadProfiles(storage), []);
});

test("(localStorage) invalid JSON is rejected without throwing", () => {
  const storage = new MemoryStorage();
  storage.setItem(PROFILES_STORAGE_KEY, "{not json");
  assert.doesNotThrow(() => loadProfiles(storage));
  assert.deepEqual(loadProfiles(storage), []);
});

test("(localStorage) a non-array stored value is rejected", () => {
  const storage = new MemoryStorage();
  storage.setItem(PROFILES_STORAGE_KEY, JSON.stringify({ status: "completed" }));
  assert.deepEqual(loadProfiles(storage), []);
});

test("(localStorage) one corrupt entry is dropped without discarding the rest of the list", () => {
  const storage = new MemoryStorage();
  const good = entry("AAA", "2026-07-01T00:00:00.000Z");
  storage.setItem(
    PROFILES_STORAGE_KEY,
    JSON.stringify([good, { id: "BBB", savedAt: "2026-07-02T00:00:00.000Z", dashboard: { status: "completed" } }]),
  );
  assert.deepEqual(loadProfiles(storage), [good]);
});

// ---- migration from the legacy single-dashboard slot ----

test("(migration) an existing legacy single dashboard is migrated into the profile list on first read", () => {
  const storage = new MemoryStorage();
  const legacy = fakeDashboard();
  storage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(legacy));

  const profiles = loadProfiles(storage, "2026-07-19T12:00:00.000Z");
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, profileKeyOf(legacy));
  assert.deepEqual(profiles[0].dashboard, legacy);
  assert.equal(profiles[0].savedAt, "2026-07-19T12:00:00.000Z");
  // The migration persists under the new key.
  assert.ok(storage.getItem(PROFILES_STORAGE_KEY));
});

test("(migration) migration never runs again once a profile list already exists, even if empty", () => {
  const storage = new MemoryStorage();
  storage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(fakeDashboard()));
  saveProfiles([], storage); // simulates "the user already deleted every profile"

  assert.deepEqual(loadProfiles(storage), []);
});

test("(migration) a malformed legacy dashboard is not migrated", () => {
  const storage = new MemoryStorage();
  storage.setItem(DASHBOARD_STORAGE_KEY, "{not json");
  assert.deepEqual(loadProfiles(storage), []);
});

// ---- add / update (upsert by KRS) ----

test("(add) upsertProfile appends a new entry for a company not yet saved", () => {
  const existing = [entry("AAA", "2026-07-01T00:00:00.000Z")];
  const next = upsertProfile(existing, fakeDashboard({ krs: "BBB" }), "2026-07-02T00:00:00.000Z");

  assert.equal(next.length, 2);
  assert.equal(next[0].id, "AAA"); // untouched
  assert.equal(next[1].id, "BBB");
  assert.equal(next[1].savedAt, "2026-07-02T00:00:00.000Z");
});

test("(update) upsertProfile replaces the matching entry in place by KRS, without touching others", () => {
  const other = entry("AAA", "2026-07-01T00:00:00.000Z", { legalName: "Inna Spółka" });
  const stale = entry("0000123456", "2026-07-01T00:00:00.000Z");
  const updatedDashboard = fakeDashboard({ legalName: "Test Sp. z o.o. (zaktualizowana)" });

  const next = upsertProfile([other, stale], updatedDashboard, "2026-07-05T00:00:00.000Z");

  assert.equal(next.length, 2);
  assert.deepEqual(next[0], other); // untouched
  assert.equal(next[1].id, "0000123456"); // same KRS-based id, same slot — not a duplicate
  assert.equal(next[1].savedAt, "2026-07-05T00:00:00.000Z");
  assert.equal(next[1].dashboard.company.legalName, "Test Sp. z o.o. (zaktualizowana)");
});

test("(update) a full add-then-update round trip through localStorage keeps exactly one entry", () => {
  const storage = new MemoryStorage();
  let profiles = upsertProfile([], fakeDashboard(), "2026-07-01T00:00:00.000Z");
  saveProfiles(profiles, storage);

  profiles = upsertProfile(loadProfiles(storage), fakeDashboard({ legalName: "Zmieniona nazwa" }), "2026-07-10T00:00:00.000Z");
  saveProfiles(profiles, storage);

  const loaded = loadProfiles(storage);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].dashboard.company.legalName, "Zmieniona nazwa");
  assert.equal(loaded[0].savedAt, "2026-07-10T00:00:00.000Z");
});

// ---- delete ----

test("(delete) removeProfile drops only the targeted entry", () => {
  const a = entry("AAA", "2026-07-01T00:00:00.000Z");
  const b = entry("BBB", "2026-07-02T00:00:00.000Z");
  assert.deepEqual(removeProfile([a, b], "AAA"), [b]);
});

test("(delete) removeProfile is a no-op for an unknown id", () => {
  const a = entry("AAA", "2026-07-01T00:00:00.000Z");
  assert.deepEqual(removeProfile([a], "does-not-exist"), [a]);
});

test("(delete) a delete persisted through localStorage is gone on the next load", () => {
  const storage = new MemoryStorage();
  const a = entry("AAA", "2026-07-01T00:00:00.000Z");
  const b = entry("BBB", "2026-07-02T00:00:00.000Z");
  saveProfiles([a, b], storage);

  saveProfiles(removeProfile(loadProfiles(storage), "AAA"), storage);

  assert.deepEqual(loadProfiles(storage).map((p) => p.id), ["BBB"]);
});

// ---- select ----

test("(select) loadProfiles sorts by most-recently-saved first", () => {
  const storage = new MemoryStorage();
  const older = entry("AAA", "2026-07-01T00:00:00.000Z");
  const newer = entry("BBB", "2026-07-10T00:00:00.000Z");
  saveProfiles([older, newer], storage);

  assert.deepEqual(loadProfiles(storage).map((p) => p.id), ["BBB", "AAA"]);
});

test("(select) a stored profile can be found and selected by its stable KRS-based id", () => {
  const storage = new MemoryStorage();
  const dashboard = fakeDashboard();
  saveProfiles([{ id: profileKeyOf(dashboard), savedAt: "2026-07-01T00:00:00.000Z", dashboard }], storage);

  const selected = loadProfiles(storage).find((p) => p.id === "0000123456");
  assert.ok(selected);
  assert.equal(selected!.dashboard.company.legalName, "Test Sp. z o.o.");
});

test("(select) selecting by id is unaffected by unrelated profiles in the list", () => {
  const storage = new MemoryStorage();
  saveProfiles(
    [entry("AAA", "2026-07-01T00:00:00.000Z"), entry("BBB", "2026-07-02T00:00:00.000Z"), entry("CCC", "2026-07-03T00:00:00.000Z")],
    storage,
  );

  const selected = loadProfiles(storage).find((p) => p.id === "BBB");
  assert.ok(selected);
  assert.equal(selected!.id, "BBB");
});

test("(select) profileKeyOf falls back to the request id when no KRS is present", () => {
  const dashboard = fakeDashboard({ krs: undefined });
  assert.equal(profileKeyOf(dashboard), `req:${dashboard.requestId}`);
});
