/**
 * Focused tests for the simple in-memory rate limiter used by the
 * company-research and ai/chat routes: window budget enforcement, per-key
 * isolation, sliding-window expiry, and the client-IP header fallback chain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIpFrom, createSimpleRateLimiter } from "../simpleRateLimiter.ts";

test("allows requests up to the per-window limit", () => {
  const rl = createSimpleRateLimiter({ windowMs: 1000, maxPerWindow: 3 });
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), true);
});

test("rejects once the per-window limit is exceeded", () => {
  const rl = createSimpleRateLimiter({ windowMs: 1000, maxPerWindow: 3 });
  rl.allow("a");
  rl.allow("a");
  rl.allow("a");
  assert.equal(rl.allow("a"), false);
});

test("continues to reject further calls while still within the window", () => {
  const rl = createSimpleRateLimiter({ windowMs: 1000, maxPerWindow: 1 });
  rl.allow("a");
  assert.equal(rl.allow("a"), false);
  assert.equal(rl.allow("a"), false);
});

test("different keys are tracked independently", () => {
  const rl = createSimpleRateLimiter({ windowMs: 1000, maxPerWindow: 1 });
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), false);
  assert.equal(rl.allow("b"), true);
});

test("allows again once the window has fully elapsed", () => {
  let t = 0;
  const rl = createSimpleRateLimiter({ windowMs: 1000, maxPerWindow: 1, now: () => t });
  assert.equal(rl.allow("a"), true);
  assert.equal(rl.allow("a"), false);
  t += 1000;
  assert.equal(rl.allow("a"), true);
});

test("is a genuine sliding window, not a hard periodic reset", () => {
  let t = 0;
  const rl = createSimpleRateLimiter({ windowMs: 1000, maxPerWindow: 2, now: () => t });
  assert.equal(rl.allow("a"), true); // t=0
  t = 500;
  assert.equal(rl.allow("a"), true); // t=500 — both hits (0, 500) within the last 1000ms
  t = 600;
  assert.equal(rl.allow("a"), false); // still 2 hits within [t-1000, t]
  t = 1001; // the t=0 hit has now aged out; only the t=500 hit remains
  assert.equal(rl.allow("a"), true);
});

test("clientIpFrom reads the first address from x-forwarded-for", () => {
  const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
  assert.equal(clientIpFrom(req), "1.2.3.4");
});

test("clientIpFrom trims whitespace around the forwarded address", () => {
  const req = new Request("http://x", { headers: { "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" } });
  assert.equal(clientIpFrom(req), "1.2.3.4");
});

test("clientIpFrom falls back to x-real-ip when x-forwarded-for is absent", () => {
  const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
  assert.equal(clientIpFrom(req), "9.9.9.9");
});

test("clientIpFrom falls back to a shared bucket when no proxy header is present", () => {
  const req = new Request("http://x");
  assert.equal(clientIpFrom(req), "unknown");
});
