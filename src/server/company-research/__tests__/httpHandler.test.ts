import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCompanyResearch } from "../httpHandler.ts";
import {
  CompanyIdentificationError,
  CompanyIdentificationTimeoutError,
  CompanyResearchProviderError,
  CompanyResearchTimeoutError,
} from "../errors.ts";
import { createIdentificationBudget } from "../identification/identificationBudget.ts";
import { sanitizeKrsResponse } from "../providers/internal/sanitizeKrsResponse.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { fakeKrsExtract } from "./krsFixture.ts";
import type { CompanyResearchDeps } from "../researchCompany.ts";
import type { IdentificationBudget } from "../identification/identificationBudget.ts";
import type { CompanyDataProvider, KrsCompany } from "../types.ts";
import type {
  CompanyIdentificationProvider,
  DiscoveredCompanyCandidate,
} from "../identification/types.ts";

const supportedCompany = sanitizeKrsResponse(fakeKrsExtract, "0000123456", "2026-07-14T10:00:00.000Z");

const enabledBudget = () =>
  createIdentificationBudget({ enabled: true, windowMs: 60000, maxPerWindow: 1000, maxConcurrent: 1000 });
const disabledBudget = () =>
  createIdentificationBudget({ enabled: false, windowMs: 60000, maxPerWindow: 1000, maxConcurrent: 1000 });
/** A budget that fails if ever consulted — proves a flow does not use it. */
const poisonBudget = (): IdentificationBudget => ({
  acquire() {
    throw new Error("budget must not be acquired for this flow");
  },
});

function krs(impl: (krs: string, signal?: AbortSignal) => Promise<KrsCompany | null>): CompanyDataProvider {
  return { name: "fake-krs", fetchByKrs: impl };
}

function ident(candidates: DiscoveredCompanyCandidate[]): CompanyIdentificationProvider {
  return { name: "fake-ident", async discoverCandidates() { return { candidates, sources: [] }; } };
}

/** An identification provider that records whether it was consulted. */
function spyIdent(candidates: DiscoveredCompanyCandidate[] = []): { provider: CompanyIdentificationProvider; called: () => boolean } {
  let wasCalled = false;
  return {
    provider: {
      name: "spy-ident",
      async discoverCandidates() {
        wasCalled = true;
        return { candidates, sources: [] };
      },
    },
    called: () => wasCalled,
  };
}

function companyIdentity(body: Record<string, unknown>): Record<string, unknown> {
  return (body.company as Record<string, unknown>).identity as Record<string, unknown>;
}

function deps(
  krsImpl: (krs: string, signal?: AbortSignal) => Promise<KrsCompany | null>,
  options: { candidates?: DiscoveredCompanyCandidate[]; identificationProvider?: CompanyIdentificationProvider; budget?: IdentificationBudget } = {},
): CompanyResearchDeps {
  return {
    krsProvider: krs(krsImpl),
    identificationProvider: options.identificationProvider ?? ident(options.candidates ?? []),
    identificationBudget: options.budget ?? enabledBudget(),
  };
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

const okDeps = deps(async () => supportedCompany);

test("invalid JSON → 400 INVALID_JSON", async () => {
  const res = await handleCompanyResearch(post("{not json"), okDeps);
  assert.equal(res.status, 400);
  const body = await bodyOf(res);
  assert.equal((body.error as Record<string, unknown>).code, "INVALID_JSON");
  assert.ok(typeof body.requestId === "string");
});

test("invalid request → 400 INVALID_REQUEST", async () => {
  const res = await handleCompanyResearch(post({}), okDeps);
  assert.equal(res.status, 400);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "INVALID_REQUEST");
});

test("oversized body → 413 REQUEST_BODY_TOO_LARGE", async () => {
  const res = await handleCompanyResearch(post({ query: { name: "a".repeat(9000) } }), okDeps);
  assert.equal(res.status, 413);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "REQUEST_BODY_TOO_LARGE");
});

test("exact KRS flow works and does NOT consume the identification budget", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa", krs: "0000123456" } }),
    deps(async () => supportedCompany, { budget: poisonBudget() }),
  );
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).status, "completed");
});

test("KRS not found → 200 not_found", async () => {
  const res = await handleCompanyResearch(post({ query: { name: "X", krs: "0000123456" } }), deps(async () => null));
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).status, "not_found");
});

test("selectedCandidateId → completed without web search and without budget", async () => {
  let searched = false;
  const identProvider: CompanyIdentificationProvider = {
    name: "fake-ident",
    async discoverCandidates() {
      searched = true;
      return { candidates: [], sources: [] };
    },
  };
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa" }, selectedCandidateId: "cmp_pl_krs_0000123456" }),
    deps(async () => supportedCompany, { identificationProvider: identProvider, budget: poisonBudget() }),
  );
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).status, "completed");
  assert.equal(searched, false);
});

test("selecting a candidate whose registry name looks nothing like the query text still succeeds (no 409)", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Zupełnie Inna Nazwa" }, selectedCandidateId: "cmp_pl_krs_0000123456" }),
    deps(async () => supportedCompany),
  );
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).status, "completed");
});

test("full flow: search → needs_confirmation → selecting any returned candidate → completed, never a 409", async () => {
  const candidates = [
    { legalName: "Zupełnie Inna Nazwa Sp. z o.o.", krs: "0000123456", countryCode: "PL" as const },
  ];
  const searchQuery = { name: "Coś Zupełnie Innego Niż Rejestr" };

  // 1) The initial name search: a weak name/registry match forces needs_confirmation.
  const searchRes = await handleCompanyResearch(
    post({ query: searchQuery }),
    deps(async () => supportedCompany, { candidates }),
  );
  assert.equal(searchRes.status, 200);
  const searchBody = await bodyOf(searchRes);
  assert.equal(searchBody.status, "needs_confirmation");
  const returnedCandidates = searchBody.candidates as Array<Record<string, unknown>>;
  assert.equal(returnedCandidates.length, 1);
  const candidateId = returnedCandidates[0].candidateId as string;
  assert.equal(candidateId, "cmp_pl_krs_0000123456");

  // 2) Confirming that exact returned candidate, sending the ORIGINAL query
  // data (never re-derived from anything the user might have since typed) —
  // must complete without any 409, regardless of the weak text match that put
  // it in needs_confirmation in the first place.
  const confirmRes = await handleCompanyResearch(
    post({ query: searchQuery, selectedCandidateId: candidateId }),
    // poisonBudget proves this confirmation never falls through to a second
    // web-search identification round — it only re-fetches the KRS entity.
    deps(async () => supportedCompany, { budget: poisonBudget() }),
  );
  assert.notEqual(confirmRes.status, 409);
  assert.equal(confirmRes.status, 200);
  const confirmBody = await bodyOf(confirmRes);
  assert.equal(confirmBody.status, "completed");
});

test("invalid selectedCandidateId → 400 INVALID_CANDIDATE_ID", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X" }, selectedCandidateId: "not-a-candidate" }),
    okDeps,
  );
  assert.equal(res.status, 400);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "INVALID_CANDIDATE_ID");
});

test("name flow → completed, free of personal data across the whole payload", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa" } }),
    deps(async () => supportedCompany, { candidates: [{ legalName: "Przykładowa", krs: "0000123456", countryCode: "PL" }] }),
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

test("name flow with no verified candidate → 200 not_found", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa" } }),
    deps(async () => null, { candidates: [{ legalName: "Przykładowa", krs: "0000123456", countryCode: "PL" }] }),
  );
  assert.equal(res.status, 200);
  assert.equal((await bodyOf(res)).status, "not_found");
});

test("name flow with identification disabled → 503 COMPANY_IDENTIFICATION_DISABLED", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Alfa" } }),
    deps(async () => supportedCompany, { budget: disabledBudget() }),
  );
  assert.equal(res.status, 503);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "COMPANY_IDENTIFICATION_DISABLED");
});

test("identification timeout → 503 COMPANY_IDENTIFICATION_TIMEOUT", async () => {
  const res = await handleCompanyResearch(post({ query: { name: "Alfa" } }), {
    krsProvider: krs(async () => null),
    identificationProvider: { name: "fake-ident", async discoverCandidates() { throw new CompanyIdentificationTimeoutError(); } },
    identificationBudget: enabledBudget(),
  });
  assert.equal(res.status, 503);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "COMPANY_IDENTIFICATION_TIMEOUT");
});

test("identification error → 502 COMPANY_IDENTIFICATION_ERROR, no leak", async () => {
  const res = await handleCompanyResearch(post({ query: { name: "Alfa" } }), {
    krsProvider: krs(async () => null),
    identificationProvider: { name: "fake-ident", async discoverCandidates() { throw new CompanyIdentificationError("raw openai detail"); } },
    identificationBudget: enabledBudget(),
  });
  assert.equal(res.status, 502);
  const err = (await bodyOf(res)).error as Record<string, unknown>;
  assert.equal(err.code, "COMPANY_IDENTIFICATION_ERROR");
  assert.ok(!String(err.message).includes("raw openai detail"));
});

test("provider 5xx → safe 503, no leak", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }),
    deps(async () => { throw new CompanyResearchProviderError("upstream 500 detail", 500); }),
  );
  assert.equal(res.status, 503);
  const err = (await bodyOf(res)).error as Record<string, unknown>;
  assert.equal(err.code, "COMPANY_RESEARCH_PROVIDER_ERROR");
  assert.ok(!String(err.message).includes("upstream 500 detail"));
});

test("provider timeout → 503 TIMEOUT", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }),
    deps(async () => { throw new CompanyResearchTimeoutError(); }),
  );
  assert.equal(res.status, 503);
  assert.equal(((await bodyOf(res)).error as Record<string, unknown>).code, "COMPANY_RESEARCH_TIMEOUT");
});

// --- foundedYear is never a confirmed profile fact (finding #1) ---

test("exact-KRS with foundedYear → completed without company.identity.foundedYear", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa", krs: "0000123456", foundedYear: 2011 } }),
    deps(async () => supportedCompany),
  );
  const body = await bodyOf(res);
  assert.equal(body.status, "completed");
  assert.equal(companyIdentity(body).foundedYear, undefined);
});

test("name flow with foundedYear → completed without company.identity.foundedYear", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa", foundedYear: 2011 } }),
    deps(async () => supportedCompany, { candidates: [{ legalName: "Przykładowa", krs: "0000123456", countryCode: "PL" }] }),
  );
  const body = await bodyOf(res);
  assert.equal(body.status, "completed");
  assert.equal(companyIdentity(body).foundedYear, undefined);
});

test("selectedCandidateId with foundedYear → completed without company.identity.foundedYear", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "Przykładowa", foundedYear: 2011 }, selectedCandidateId: "cmp_pl_krs_0000123456" }),
    deps(async () => supportedCompany),
  );
  const body = await bodyOf(res);
  assert.equal(body.status, "completed");
  assert.equal(companyIdentity(body).foundedYear, undefined);
});

// --- the identification provider is only consulted by the active name flow ---

test("exact-KRS flow does NOT consult the identification provider", async () => {
  const spy = spyIdent();
  await handleCompanyResearch(post({ query: { name: "Przykładowa", krs: "0000123456" } }), {
    krsProvider: krs(async () => supportedCompany),
    identificationProvider: spy.provider,
    identificationBudget: enabledBudget(),
  });
  assert.equal(spy.called(), false);
});

test("selectedCandidateId flow does NOT consult the identification provider", async () => {
  const spy = spyIdent();
  await handleCompanyResearch(post({ query: { name: "Przykładowa" }, selectedCandidateId: "cmp_pl_krs_0000123456" }), {
    krsProvider: krs(async () => supportedCompany),
    identificationProvider: spy.provider,
    identificationBudget: enabledBudget(),
  });
  assert.equal(spy.called(), false);
});

test("disabled name flow does NOT consult the identification provider", async () => {
  const spy = spyIdent();
  await handleCompanyResearch(post({ query: { name: "Alfa" } }), {
    krsProvider: krs(async () => supportedCompany),
    identificationProvider: spy.provider,
    identificationBudget: disabledBudget(),
  });
  assert.equal(spy.called(), false);
});

test("active name flow DOES consult the identification provider", async () => {
  const spy = spyIdent([{ legalName: "Alfa", krs: "0000000001", countryCode: "PL" }]);
  await handleCompanyResearch(post({ query: { name: "Alfa" } }), {
    krsProvider: krs(async () => null),
    identificationProvider: spy.provider,
    identificationBudget: enabledBudget(),
  });
  assert.equal(spy.called(), true);
});

test("client abort → 499, no error body", async () => {
  const res = await handleCompanyResearch(
    post({ query: { name: "X", krs: "0000123456" } }, { signal: AbortSignal.abort() }),
    deps(async () => { throw new DOMException("aborted", "AbortError"); }),
  );
  assert.equal(res.status, 499);
});
