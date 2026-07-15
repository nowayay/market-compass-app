import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCompanyResearch } from "../httpHandler.ts";
import {
  CompanyResearchProviderError,
  CompanyResearchTimeoutError,
} from "../errors.ts";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { fakeKrsExtract } from "./krsFixture.ts";
import type { CompanyDataProvider, KrsCompany } from "../types.ts";

const supportedCompany = sanitizeKrsResponse(fakeKrsExtract, "0000123456", "2026-07-14T10:00:00.000Z");

function provider(
  impl: (krs: string, signal?: AbortSignal) => Promise<KrsCompany | null>,
): CompanyDataProvider {
  return { name: "fake", fetchByKrs: impl };
}

function post(payload: unknown, init?: RequestInit): Request {
  return new Request("http://x/api/company-research", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    ...init,
  });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

const okProvider = provider(async () => supportedCompany);

test("invalid JSON → 400 INVALID_JSON", async () => {
  const res = await handleCompanyResearch(post("{not json"), okProvider);
  assert.equal(res.status, 400);
  const body = await bodyOf(res);
  assert.equal((body.error as Record<string, unknown>).code, "INVALID_JSON");
  assert.ok(typeof body.requestId === "string");
});

test("invalid request → 400 INVALID_REQUEST", async () => {
  const res = await handleCompanyResearch(post({}), okProvider);
  assert.equal(res.status, 400);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "INVALID_REQUEST");
});

test("oversized body → 413 REQUEST_BODY_TOO_LARGE", async () => {
  const huge = { query: { name: "a".repeat(9000) } };
  const res = await handleCompanyResearch(post(huge), okProvider);
  assert.equal(res.status, 413);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "REQUEST_BODY_TOO_LARGE");
});

test("selectedCandidateId → 501 UNSUPPORTED_OPERATION", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" }, selectedCandidateId: "cand_1" }),
    okProvider,
  );
  assert.equal(res.status, 501);
  const body = await bodyOf(res);
  const err = body.error as Record<string, unknown>;
  assert.equal(err.code, "UNSUPPORTED_OPERATION");
  // Must not imply the confirmation flow already works.
  assert.ok(!String(err.message).toLowerCase().includes("wybra"));
});

test("KRS not found → 200 not_found", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }),
    provider(async () => null),
  );
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).status, "not_found");
});

test("completed → 200, valid, and free of personal data across the whole payload", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa", krs: "0000123456" } }),
    okProvider,
  );
  assert.equal(res.status, 200);
  const body = await bodyOf(res);
  assert.equal(body.status, "completed");
  const serialized = JSON.stringify(body);
  for (const needle of ["KOWALSKI", "NOWAK", "WIŚNIEWSKI", "PREZES", "00000000000", "KWIATOWA"]) {
    assert.ok(!serialized.includes(needle), `leaked: ${needle}`);
  }
  assert.doesNotThrow(() => assertNoPersonalData(body, "response"));
});

test("provider 5xx → safe 503, no leak", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }),
    provider(async () => {
      throw new CompanyResearchProviderError("upstream 500 detail", 500);
    }),
  );
  assert.equal(res.status, 503);
  const err = (await bodyOf(res)).error as Record<string, unknown>;
  assert.equal(err.code, "COMPANY_RESEARCH_PROVIDER_ERROR");
  assert.ok(!String(err.message).includes("upstream 500 detail"));
});

test("provider timeout → 503 TIMEOUT", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }),
    provider(async () => {
      throw new CompanyResearchTimeoutError();
    }),
  );
  assert.equal(res.status, 503);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "COMPANY_RESEARCH_TIMEOUT");
});

test("client abort → 499, no error body", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }, { signal: AbortSignal.abort() }),
    provider(async () => {
      throw new DOMException("aborted", "AbortError");
    }),
  );
  assert.equal(res.status, 499);
});
