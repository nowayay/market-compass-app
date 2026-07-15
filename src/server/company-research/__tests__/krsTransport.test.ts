import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_KRS_ORIGIN,
  classifyKrsFailure,
  createKrsTransport,
} from "../providers/internal/krsTransport.ts";
import {
  CompanyResearchProviderError,
  CompanyResearchTimeoutError,
} from "../errors.ts";
import { fakeKrsExtract } from "./krsFixture.ts";

/** Wraps a handler as a `fetch`-typed mock. */
function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as unknown as typeof fetch;
}

/** Fetch mock that never resolves until its signal aborts (for timeout tests). */
function hangingFetch(): typeof fetch {
  return mockFetch(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const s = init?.signal;
        if (s?.aborted) {
          reject(s.reason ?? new DOMException("aborted", "AbortError"));
          return;
        }
        s?.addEventListener("abort", () =>
          reject(s.reason ?? new DOMException("aborted", "AbortError")),
        );
      }),
  );
}

test("classifyKrsFailure prioritizes caller abort, then timeout", () => {
  assert.equal(classifyKrsFailure({ callerAborted: true, timedOut: true }), "abort");
  assert.equal(classifyKrsFailure({ callerAborted: false, timedOut: true }), "timeout");
  assert.equal(classifyKrsFailure({ callerAborted: false, timedOut: false }), "provider");
});

test("production transport targets ONLY the official host", async () => {
  let captured = "";
  const provider = createKrsTransport({
    fetchImpl: mockFetch(async (url) => {
      captured = url;
      return new Response(null, { status: 404 });
    }),
    timeoutMs: 5000,
  });

  await provider.fetchByKrs("0000123456");
  const url = new URL(captured);
  assert.equal(url.origin, "https://api-krs.ms.gov.pl");
  assert.equal(OFFICIAL_KRS_ORIGIN, "https://api-krs.ms.gov.pl");
  assert.equal(
    captured,
    `${OFFICIAL_KRS_ORIGIN}/api/krs/OdpisAktualny/0000123456?rejestr=P&format=json`,
  );
});

test("404 resolves to null (not found)", async () => {
  const provider = createKrsTransport({
    fetchImpl: mockFetch(async () => new Response(null, { status: 404 })),
    timeoutMs: 5000,
  });
  assert.equal(await provider.fetchByKrs("0000123456"), null);
});

test("HTTP 500 becomes a provider error with the status", async () => {
  const provider = createKrsTransport({
    fetchImpl: mockFetch(async () => new Response("upstream error body", { status: 500 })),
    timeoutMs: 5000,
  });
  await assert.rejects(
    () => provider.fetchByKrs("0000123456"),
    (e: unknown) => {
      assert.ok(e instanceof CompanyResearchProviderError);
      assert.equal(e.status, 500);
      // The raw upstream body must not leak into the error message.
      assert.ok(!e.message.includes("upstream error body"));
      return true;
    },
  );
});

test("malformed JSON becomes a provider error without leaking the body", async () => {
  const provider = createKrsTransport({
    fetchImpl: mockFetch(async () => new Response("<<<not json>>>", { status: 200 })),
    timeoutMs: 5000,
  });
  await assert.rejects(
    () => provider.fetchByKrs("0000123456"),
    (e: unknown) => {
      assert.ok(e instanceof CompanyResearchProviderError);
      assert.ok(!e.message.includes("not json"));
      return true;
    },
  );
});

test("caller abort propagates as an AbortError (not a provider outage)", async () => {
  const provider = createKrsTransport({
    fetchImpl: hangingFetch(),
    timeoutMs: 5000,
  });
  await assert.rejects(
    () => provider.fetchByKrs("0000123456", AbortSignal.abort()),
    (e: unknown) => {
      assert.ok(!(e instanceof CompanyResearchProviderError));
      assert.ok(!(e instanceof CompanyResearchTimeoutError));
      assert.equal((e as { name?: string }).name, "AbortError");
      return true;
    },
  );
});

test("provider timeout becomes a typed timeout error", async () => {
  const provider = createKrsTransport({
    fetchImpl: hangingFetch(),
    timeoutMs: 20,
  });
  await assert.rejects(
    () => provider.fetchByKrs("0000123456"),
    CompanyResearchTimeoutError,
  );
});

test("successful response maps to a sanitized company", async () => {
  const provider = createKrsTransport({
    fetchImpl: mockFetch(
      async () =>
        new Response(JSON.stringify(fakeKrsExtract), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
    timeoutMs: 5000,
  });
  const company = await provider.fetchByKrs("0000123456");
  assert.ok(company);
  assert.equal(company?.legalName, "PRZYKŁADOWA SPÓŁKA SP. Z O.O.");
  // No person data leaks through the transport.
  assert.ok(!JSON.stringify(company).includes("KOWALSKI"));
});
