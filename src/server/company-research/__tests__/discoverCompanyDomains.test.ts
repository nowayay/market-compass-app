import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverCompanyDomains } from "../domain-discovery/discoverCompanyDomains.ts";
import { createDomainDiscoveryBudget } from "../domain-discovery/domainDiscoveryBudget.ts";
import { buildDomainDiscoveryInput } from "../domain-discovery/buildDomainDiscoveryInput.ts";
import {
  DomainDiscoveryDisabledError,
  DomainDiscoveryRateLimitedError,
} from "../domain-discovery/errors.ts";
import { PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";
import type {
  CompanyDomainDiscoveryInput,
  CompanyDomainDiscoveryProvider,
  CompanyDomainDiscoveryResult,
} from "../domain-discovery/types.ts";
import type { KrsCompany } from "../types.ts";

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "PRZYKŁADOWA SP. Z O.O.",
  legalForm: "SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  nip: "1234563218",
  regon: "123456785",
  registrationDate: "2011-01-01",
  city: "Warszawa",
  region: "Mazowieckie",
  countryCode: "PL",
  pkdSecondaryCodes: [],
  pkdLabels: [],
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

function spyProvider(
  result: CompanyDomainDiscoveryResult = { candidates: [] },
): { provider: CompanyDomainDiscoveryProvider; calls: CompanyDomainDiscoveryInput[] } {
  const calls: CompanyDomainDiscoveryInput[] = [];
  return {
    calls,
    provider: {
      name: "spy",
      async discoverDomainCandidates(input) {
        calls.push(input);
        return result;
      },
    },
  };
}

const enabledBudget = () =>
  createDomainDiscoveryBudget({ enabled: true, windowMs: 60000, maxPerWindow: 1000, maxConcurrent: 1 });

test("builds and forwards only the allowlisted input", async () => {
  const spy = spyProvider();
  await discoverCompanyDomains(COMPANY, { provider: spy.provider, budget: enabledBudget() });
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(spy.calls[0], buildDomainDiscoveryInput(COMPANY));
  assert.deepEqual(
    Object.keys(spy.calls[0]).sort(),
    ["aliases", "city", "countryCode", "krs", "legalForm", "legalName", "nip", "region", "regon"],
  );
});

test("disabled feature performs NO provider call", async () => {
  const spy = spyProvider();
  const budget = createDomainDiscoveryBudget({ enabled: false, windowMs: 60000, maxPerWindow: 10, maxConcurrent: 1 });
  await assert.rejects(
    () => discoverCompanyDomains(COMPANY, { provider: spy.provider, budget }),
    DomainDiscoveryDisabledError,
  );
  assert.equal(spy.calls.length, 0);
});

test("rate-limited request performs NO provider call", async () => {
  const spy = spyProvider();
  const budget = createDomainDiscoveryBudget({ enabled: true, windowMs: 60000, maxPerWindow: 0, maxConcurrent: 1 });
  await assert.rejects(
    () => discoverCompanyDomains(COMPANY, { provider: spy.provider, budget }),
    DomainDiscoveryRateLimitedError,
  );
  assert.equal(spy.calls.length, 0);
});

test("budget is released after a successful discovery", async () => {
  const spy = spyProvider();
  const budget = enabledBudget(); // maxConcurrent: 1
  await discoverCompanyDomains(COMPANY, { provider: spy.provider, budget });
  // If the slot were not released, this would throw DomainDiscoveryBusyError.
  assert.doesNotThrow(() => budget.acquire()());
});

test("budget is released after a provider failure", async () => {
  const failing: CompanyDomainDiscoveryProvider = {
    name: "failing",
    async discoverDomainCandidates() {
      throw new Error("provider boom");
    },
  };
  const budget = enabledBudget(); // maxConcurrent: 1
  await assert.rejects(() => discoverCompanyDomains(COMPANY, { provider: failing, budget }));
  assert.doesNotThrow(() => budget.acquire()());
});

test("input privacy guard runs before any provider call", async () => {
  const spy = spyProvider();
  const leaky: KrsCompany = { ...COMPANY, legalName: "Kontakt biuro@ukryta.example Sp. z o.o." };
  await assert.rejects(
    () => discoverCompanyDomains(leaky, { provider: spy.provider, budget: enabledBudget() }),
    (e: unknown) => e instanceof PersonalDataLeakError && e.code === "EMAIL_ADDRESS",
  );
  assert.equal(spy.calls.length, 0);
});

test("result carries no exact URL and no verified/official field", async () => {
  const spy = spyProvider({
    candidates: [
      {
        origin: "https://przykladowa.example",
        domain: "przykladowa.example",
        signals: { matchedLegalName: "PRZYKŁADOWA SP. Z O.O.", matchedKrs: "0000123456", matchedNip: null, matchedRegon: null, matchedCity: "Warszawa" },
        sourceOrigins: ["https://przykladowa.example"],
      },
    ],
  });
  const result = await discoverCompanyDomains(COMPANY, { provider: spy.provider, budget: enabledBudget() });
  const dump = JSON.stringify(result);
  // No status/scoring fields belong at this stage.
  for (const forbidden of ["verified", "official", "confidence", "score"]) {
    assert.ok(!dump.includes(forbidden), `unexpected field: ${forbidden}`);
  }
  // Every retained URL is origin-only: no path/query/fragment survives.
  for (const candidate of result.candidates) {
    assert.equal(candidate.origin, new URL(candidate.origin).origin);
    for (const origin of candidate.sourceOrigins) assert.equal(origin, new URL(origin).origin);
  }
});
