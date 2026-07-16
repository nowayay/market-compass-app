import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainDiscoveryBudget } from "../domain-discovery/domainDiscoveryBudget.ts";
import {
  DomainDiscoveryBusyError,
  DomainDiscoveryDisabledError,
  DomainDiscoveryRateLimitedError,
} from "../domain-discovery/errors.ts";

const base = { windowMs: 60000, maxPerWindow: 1000, maxConcurrent: 1000 };

test("disabled feature → acquire throws DomainDiscoveryDisabledError", () => {
  const budget = createDomainDiscoveryBudget({ ...base, enabled: false });
  assert.throws(() => budget.acquire(), DomainDiscoveryDisabledError);
});

test("window limit rejects extra STARTED discoveries", () => {
  let t = 0;
  const budget = createDomainDiscoveryBudget({
    enabled: true, windowMs: 1000, maxPerWindow: 2, maxConcurrent: 1000, now: () => t,
  });
  budget.acquire()();
  budget.acquire()();
  assert.throws(() => budget.acquire(), DomainDiscoveryRateLimitedError);
  // After the window slides, a new slot is available again.
  t = 1001;
  assert.doesNotThrow(() => budget.acquire()());
});

test("concurrency limit rejects too many in-flight discoveries", () => {
  const budget = createDomainDiscoveryBudget({ ...base, enabled: true, maxConcurrent: 1 });
  const release = budget.acquire();
  assert.throws(() => budget.acquire(), DomainDiscoveryBusyError);
  release();
  assert.doesNotThrow(() => budget.acquire()());
});

test("release is idempotent", () => {
  const budget = createDomainDiscoveryBudget({ ...base, enabled: true, maxConcurrent: 1 });
  const release = budget.acquire();
  release();
  release();
  assert.doesNotThrow(() => budget.acquire()());
});
