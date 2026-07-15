import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentificationBudget } from "../identification/identificationBudget.ts";
import {
  CompanyIdentificationBusyError,
  CompanyIdentificationDisabledError,
  CompanyIdentificationRateLimitedError,
} from "../errors.ts";

test("disabled feature → acquire throws CompanyIdentificationDisabledError", () => {
  const budget = createIdentificationBudget({ enabled: false, windowMs: 1000, maxPerWindow: 10, maxConcurrent: 10 });
  assert.throws(() => budget.acquire(), CompanyIdentificationDisabledError);
});

test("window limit counts STARTED identifications and rejects extras", () => {
  let nowMs = 0;
  const budget = createIdentificationBudget({
    enabled: true,
    windowMs: 1000,
    maxPerWindow: 2,
    maxConcurrent: 10,
    now: () => nowMs,
  });
  budget.acquire()(); // start #1 then release
  budget.acquire()(); // start #2 then release
  // Third start within the window is rejected even though nothing is active.
  assert.throws(() => budget.acquire(), CompanyIdentificationRateLimitedError);
  // After the window slides, a new start is allowed again.
  nowMs = 1001;
  assert.doesNotThrow(() => budget.acquire()());
});

test("concurrency limit rejects too many in-flight identifications", () => {
  const budget = createIdentificationBudget({ enabled: true, windowMs: 100000, maxPerWindow: 100, maxConcurrent: 2, now: () => 0 });
  const r1 = budget.acquire();
  const r2 = budget.acquire();
  assert.throws(() => budget.acquire(), CompanyIdentificationBusyError);
  r1();
  // A slot freed → next acquire succeeds.
  assert.doesNotThrow(() => budget.acquire()());
  r2();
});

test("releasing a slot (after success OR error) frees concurrency", () => {
  const budget = createIdentificationBudget({ enabled: true, windowMs: 100000, maxPerWindow: 100, maxConcurrent: 1, now: () => 0 });
  const release = budget.acquire();
  release(); // e.g. called in a finally after success or error
  assert.doesNotThrow(() => budget.acquire()());
});

test("release is idempotent", () => {
  const budget = createIdentificationBudget({ enabled: true, windowMs: 100000, maxPerWindow: 100, maxConcurrent: 1, now: () => 0 });
  const release = budget.acquire();
  release();
  release(); // must not over-decrement
  const r = budget.acquire();
  assert.throws(() => budget.acquire(), CompanyIdentificationBusyError); // only 1 active allowed
  r();
});
