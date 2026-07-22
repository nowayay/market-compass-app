import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmCompanyDomain } from "../domain-confirmation/confirmCompanyDomain.ts";
import { createDomainConfirmationBudget } from "../domain-confirmation/confirmationBudget.ts";
import {
  DomainConfirmationDisabledError,
  DomainConfirmationError,
  DomainConfirmationRateLimitedError,
} from "../domain-confirmation/errors.ts";
import type { DomainConfirmationBudget } from "../domain-confirmation/confirmationBudget.ts";
import type {
  CompanyDomainConfirmationProvider,
  DomainConfirmationInput,
  DomainConfirmationProviderResult,
} from "../domain-confirmation/types.ts";
import type {
  CompanyDomainEvaluationResult,
  EvaluatedDomainCandidate,
} from "../domain-evaluation/types.ts";
import type { KrsCompany } from "../types.ts";

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "PRZYKŁADOWA SP. Z O.O.",
  nip: "1234563218",
  regon: "123456785",
  city: "Warszawa",
  region: "Mazowieckie",
  countryCode: "PL",
  pkdSecondaryCodes: [],
  pkdLabels: [],
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

const ORIGIN = "https://przykladowa.example";
const DOMAIN = "przykladowa.example";

function candidate(): EvaluatedDomainCandidate {
  return {
    origin: ORIGIN,
    domain: DOMAIN,
    status: "probable",
    score: 100,
    reasons: [],
    conflicts: [],
    sourceOrigins: [ORIGIN],
    signals: {
      matchedLegalName: null,
      matchedKrs: null,
      matchedNip: null,
      matchedRegon: null,
      matchedCity: null,
    },
  };
}

function evaluation(
  status: CompanyDomainEvaluationResult["status"] = "probable",
  selected: EvaluatedDomainCandidate | null = candidate(),
): CompanyDomainEvaluationResult {
  return { status, selectedCandidate: selected, candidates: selected ? [selected] : [], reasons: [] };
}

/** A provider stub that records its input and returns / throws a scripted result. */
function stubProvider(
  handler: (input: DomainConfirmationInput) => Promise<DomainConfirmationProviderResult>,
) {
  const calls: DomainConfirmationInput[] = [];
  const provider: CompanyDomainConfirmationProvider = {
    name: "stub",
    confirmDomain(input) {
      calls.push(input);
      return handler(input);
    },
  };
  return { provider, calls };
}

/** Wraps a budget to count acquire/release. */
function countingBudget(inner: DomainConfirmationBudget) {
  const counts = { acquired: 0, released: 0 };
  const budget: DomainConfirmationBudget = {
    acquire() {
      counts.acquired += 1;
      const release = inner.acquire();
      return () => {
        counts.released += 1;
        release();
      };
    },
  };
  return { budget, counts };
}

function enabledBudget() {
  return createDomainConfirmationBudget({ enabled: true, windowMs: 1000, maxPerWindow: 10, maxConcurrent: 5 });
}

function found(o: { nip?: string[]; krs?: string[]; regon?: string[] } = {}) {
  return {
    found: {
      krs: o.krs ?? [],
      nip: o.nip ?? [],
      regon: o.regon ?? [],
      malformedKrs: false,
      malformedNip: false,
      malformedRegon: false,
    },
    sourceOrigins: [ORIGIN],
  };
}

// (31) expected identifiers never reach the provider call + success path confirms
test("confirms and NEVER forwards the expected identifiers to the provider", async () => {
  const { provider, calls } = stubProvider(async () => found({ nip: ["1234563218"] }));
  const { budget, counts } = countingBudget(enabledBudget());

  const result = await confirmCompanyDomain(COMPANY, evaluation(), { provider, budget });

  assert.equal(result.status, "confirmed");
  assert.equal(result.confirmedOrigin, ORIGIN);

  assert.equal(calls.length, 1);
  const input = calls[0] as unknown as Record<string, unknown>;
  assert.ok(!("krs" in input) && !("nip" in input) && !("regon" in input));
  const serialized = JSON.stringify(calls[0]);
  assert.ok(!serialized.includes(COMPANY.krs));
  assert.ok(!serialized.includes(COMPANY.nip as string));
  assert.ok(!serialized.includes(COMPANY.regon as string));

  // (35) budget acquired and released on success
  assert.deepEqual(counts, { acquired: 1, released: 1 });
});

// (33) disabled feature performs no OpenAI call
test("disabled budget throws and performs no provider call", async () => {
  const { provider, calls } = stubProvider(async () => found({ nip: ["1234563218"] }));
  const budget = createDomainConfirmationBudget({ enabled: false, windowMs: 1000, maxPerWindow: 10, maxConcurrent: 1 });

  await assert.rejects(
    () => confirmCompanyDomain(COMPANY, evaluation(), { provider, budget }),
    DomainConfirmationDisabledError,
  );
  assert.equal(calls.length, 0);
});

// (34) rate-limited request performs no OpenAI call
test("rate-limited budget throws and performs no provider call", async () => {
  const { provider, calls } = stubProvider(async () => found({ nip: ["1234563218"] }));
  const inner = createDomainConfirmationBudget({ enabled: true, windowMs: 10000, maxPerWindow: 1, maxConcurrent: 10 });
  inner.acquire()(); // exhaust the single window slot

  await assert.rejects(
    () => confirmCompanyDomain(COMPANY, evaluation(), { provider, budget: inner }),
    DomainConfirmationRateLimitedError,
  );
  assert.equal(calls.length, 0);
});

// (36) budget released after failure + (37) provider failure fails closed → unverified
test("a provider failure fails closed to unverified AND releases the budget", async () => {
  const { provider } = stubProvider(async () => {
    throw new DomainConfirmationError("provider exploded");
  });
  const { budget, counts } = countingBudget(enabledBudget());

  const result = await confirmCompanyDomain(COMPANY, evaluation(), { provider, budget });
  assert.equal(result.status, "unverified");
  assert.deepEqual(result.reasons, ["CONFIRMATION_UNAVAILABLE"]);
  assert.equal(result.confirmedOrigin, null);

  // released even though the provider threw
  assert.deepEqual(counts, { acquired: 1, released: 1 });
});

// (37) refusal/incomplete surface as InvalidDomainConfirmationResponseError → unverified
test("an invalid provider response fails closed to unverified", async () => {
  const { provider } = stubProvider(async () => {
    const { InvalidDomainConfirmationResponseError } = await import("../domain-confirmation/errors.ts");
    throw new InvalidDomainConfirmationResponseError();
  });
  const result = await confirmCompanyDomain(COMPANY, evaluation(), {
    provider,
    budget: enabledBudget(),
  });
  assert.equal(result.status, "unverified");
});

// gating: never run (no budget, no provider) for non-probable evaluations
test("an unverified evaluation never touches the budget or provider", async () => {
  const { provider, calls } = stubProvider(async () => found({ nip: ["1234563218"] }));
  const { budget, counts } = countingBudget(enabledBudget());

  const result = await confirmCompanyDomain(
    COMPANY,
    evaluation("unverified", null),
    { provider, budget },
  );
  assert.equal(result.status, "unverified");
  assert.equal(calls.length, 0);
  assert.deepEqual(counts, { acquired: 0, released: 0 });
});

test("a not_found evaluation never touches the budget or provider", async () => {
  const { provider, calls } = stubProvider(async () => found({ nip: ["1234563218"] }));
  const { budget, counts } = countingBudget(enabledBudget());

  const result = await confirmCompanyDomain(
    COMPANY,
    evaluation("not_found", null),
    { provider, budget },
  );
  assert.equal(result.status, "unverified");
  assert.equal(calls.length, 0);
  assert.deepEqual(counts, { acquired: 0, released: 0 });
});

// caller cancellation propagates (is not swallowed as unverified)
test("caller cancellation propagates instead of failing closed", async () => {
  const controller = new AbortController();
  const { provider } = stubProvider(async () => {
    controller.abort();
    throw new Error("aborted by caller");
  });
  await assert.rejects(() =>
    confirmCompanyDomain(COMPANY, evaluation(), { provider, budget: enabledBudget() }, { signal: controller.signal }),
  );
});
