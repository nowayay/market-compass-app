import { test } from "node:test";
import assert from "node:assert/strict";
import { lazyIdentificationProvider } from "../identification/lazyIdentificationProvider.ts";
import type {
  CompanyIdentificationProvider,
  DiscoveryResult,
} from "../identification/types.ts";

const EMPTY: DiscoveryResult = { candidates: [], sources: [] };
const QUERY = { name: "Alfa", countryCode: "PL" };

function counting(): { provider: CompanyIdentificationProvider; builds: number; calls: number } {
  const state = { builds: 0, calls: 0 };
  const inner: CompanyIdentificationProvider = {
    name: "inner",
    async discoverCandidates() {
      state.calls += 1;
      return EMPTY;
    },
  };
  const provider = lazyIdentificationProvider(() => {
    state.builds += 1;
    return inner;
  });
  return { provider, get builds() { return state.builds; }, get calls() { return state.calls; } };
}

test("build() is NOT called on construction", () => {
  const c = counting();
  assert.equal(c.builds, 0);
});

test("build() runs lazily on the first discoverCandidates call only", async () => {
  const c = counting();
  await c.provider.discoverCandidates(QUERY);
  assert.equal(c.builds, 1);
  assert.equal(c.calls, 1);

  await c.provider.discoverCandidates(QUERY);
  assert.equal(c.builds, 1); // not rebuilt
  assert.equal(c.calls, 2);
});
