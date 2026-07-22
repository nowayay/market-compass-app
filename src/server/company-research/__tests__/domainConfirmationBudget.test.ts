import { test } from "node:test";
import assert from "node:assert/strict";
import { createDomainConfirmationBudget } from "../domain-confirmation/confirmationBudget.ts";
import {
  DomainConfirmationBusyError,
  DomainConfirmationDisabledError,
  DomainConfirmationRateLimitedError,
} from "../domain-confirmation/errors.ts";

function budget(o: {
  enabled?: boolean;
  windowMs?: number;
  maxPerWindow?: number;
  maxConcurrent?: number;
  now?: () => number;
} = {}) {
  return createDomainConfirmationBudget({
    enabled: o.enabled ?? true,
    windowMs: o.windowMs ?? 1000,
    maxPerWindow: o.maxPerWindow ?? 10,
    maxConcurrent: o.maxConcurrent ?? 1,
    now: o.now,
  });
}

test("disabled budget throws DomainConfirmationDisabledError", () => {
  assert.throws(() => budget({ enabled: false }).acquire(), DomainConfirmationDisabledError);
});

test("exhausting the window budget throws DomainConfirmationRateLimitedError", () => {
  const b = budget({ maxPerWindow: 2, maxConcurrent: 10 });
  b.acquire()();
  b.acquire()();
  assert.throws(() => b.acquire(), DomainConfirmationRateLimitedError);
});

test("too many concurrent acquisitions throw DomainConfirmationBusyError", () => {
  const b = budget({ maxConcurrent: 1, maxPerWindow: 10 });
  const release = b.acquire();
  assert.throws(() => b.acquire(), DomainConfirmationBusyError);
  release();
  // After release, a slot is free again.
  assert.doesNotThrow(() => b.acquire()());
});

test("the rolling window frees window slots as time advances", () => {
  let t = 0;
  const b = budget({ maxPerWindow: 1, windowMs: 1000, maxConcurrent: 10, now: () => t });
  b.acquire()();
  assert.throws(() => b.acquire(), DomainConfirmationRateLimitedError);
  t = 1001;
  assert.doesNotThrow(() => b.acquire()());
});

test("release is idempotent (double release does not free extra concurrency)", () => {
  const b = budget({ maxConcurrent: 1, maxPerWindow: 10 });
  const release = b.acquire();
  release();
  release();
  const second = b.acquire();
  assert.throws(() => b.acquire(), DomainConfirmationBusyError);
  second();
});
