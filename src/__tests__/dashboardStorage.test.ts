/**
 * Focused MVP tests for localStorage persistence of the last completed
 * dashboard: save, restore-on-load, and rejecting a tampered/invalid stored
 * value instead of trusting it blindly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DASHBOARD_STORAGE_KEY, clearDashboard, loadDashboard, saveDashboard } from "../lib/dashboardStorage.ts";
import type { DashboardCompletedResponse } from "../types.ts";

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

function fakeDashboard(): DashboardCompletedResponse {
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

test("(localStorage restore) loadDashboard returns null when nothing is stored", () => {
  const storage = new MemoryStorage();
  assert.equal(loadDashboard(storage), null);
});

test("(localStorage restore) saveDashboard then loadDashboard restores the exact completed dashboard", () => {
  const storage = new MemoryStorage();
  const dashboard = fakeDashboard();
  saveDashboard(dashboard, storage);
  const restored = loadDashboard(storage);
  assert.deepEqual(restored, dashboard);
  assert.ok(storage.getItem(DASHBOARD_STORAGE_KEY));
});

test("(localStorage restore) a tampered/malformed stored value is rejected, not trusted", () => {
  const storage = new MemoryStorage();
  storage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify({ status: "completed", not: "a valid dashboard" }));
  assert.equal(loadDashboard(storage), null);
});

test("(localStorage restore) invalid JSON is rejected without throwing", () => {
  const storage = new MemoryStorage();
  storage.setItem(DASHBOARD_STORAGE_KEY, "{not json");
  assert.doesNotThrow(() => loadDashboard(storage));
  assert.equal(loadDashboard(storage), null);
});

test("(localStorage restore) a completed dashboard with an unsupported country code is rejected, not trusted", () => {
  const storage = new MemoryStorage();
  const dashboard = fakeDashboard();
  dashboard.expansion.rankedCountries[0] = {
    ...dashboard.expansion.rankedCountries[0],
    countryCode: "ZZ",
  };
  storage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(dashboard));
  assert.equal(loadDashboard(storage), null);
});

test("(localStorage restore) a non-completed status is never restored as a dashboard", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    DASHBOARD_STORAGE_KEY,
    JSON.stringify({ status: "not_found", requestId: "req_1", query: { name: "x", countryCode: "PL" }, message: "m" }),
  );
  assert.equal(loadDashboard(storage), null);
});

test("(localStorage restore) clearDashboard removes the stored value, providing a clean 'start a new analysis'", () => {
  const storage = new MemoryStorage();
  saveDashboard(fakeDashboard(), storage);
  assert.ok(loadDashboard(storage));
  clearDashboard(storage);
  assert.equal(loadDashboard(storage), null);
});
