import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_KRS_VERIFICATIONS,
  identifyByName,
} from "../identification/identifyByName.ts";
import {
  CompanyIdentificationError,
  CompanyIdentificationTimeoutError,
} from "../errors.ts";
import type {
  CompanyIdentificationProvider,
  DiscoveredCompanyCandidate,
  DiscoveryResult,
} from "../identification/types.ts";
import type { SafeDiscoveredSource } from "../identification/webSourceSecurity.ts";
import type { CompanyDataProvider, KrsCompany, NormalizedQuery } from "../types.ts";

const CTX = { requestId: "req-1", version: "test", researchedAt: "2026-07-15T10:00:00.000Z" };

function krsCompany(krs: string, legalName: string): KrsCompany {
  return { krs, legalName, countryCode: "PL", pkdSecondaryCodes: [], pkdLabels: [], retrievedAt: CTX.researchedAt };
}

function discovered(krs: string, legalName: string): DiscoveredCompanyCandidate {
  return { legalName, krs, countryCode: "PL" };
}

function identProvider(candidates: DiscoveredCompanyCandidate[], sources: SafeDiscoveredSource[] = []): CompanyIdentificationProvider {
  const result: DiscoveryResult = { candidates, sources };
  return { name: "fake-ident", async discoverCandidates() { return result; } };
}

function identThrowing(error: unknown): CompanyIdentificationProvider {
  return { name: "fake-ident", async discoverCandidates() { throw error; } };
}

function krsProviderFrom(map: Record<string, KrsCompany | null>): { provider: CompanyDataProvider; calls: string[] } {
  const calls: string[] = [];
  const provider: CompanyDataProvider = {
    name: "fake-krs",
    async fetchByKrs(krs) {
      calls.push(krs);
      return krs in map ? map[krs] : null;
    },
  };
  return { provider, calls };
}

const query = (name: string): NormalizedQuery => ({ name, countryCode: "PL" });

test("single exact verified candidate → completed", async () => {
  const { provider } = krsProviderFrom({ "0000000001": krsCompany("0000000001", "Alfa") });
  const res = await identifyByName(
    query("Alfa"),
    { identificationProvider: identProvider([discovered("0000000001", "Alfa")]), krsProvider: provider },
    CTX,
  );
  assert.equal(res.status, "completed");
});

test("multiple verified candidates → needs_confirmation, sorted deterministically", async () => {
  const { provider } = krsProviderFrom({
    "0000000001": krsCompany("0000000001", "Alfa"),
    "0000000002": krsCompany("0000000002", "Alfa Group Holding"),
  });
  // Discovery returns them in reverse-confidence order; output must be sorted.
  const res = await identifyByName(
    query("Alfa"),
    {
      identificationProvider: identProvider([discovered("0000000002", "Alfa Group Holding"), discovered("0000000001", "Alfa")]),
      krsProvider: provider,
    },
    CTX,
  );
  assert.equal(res.status, "needs_confirmation");
  if (res.status === "needs_confirmation") {
    assert.equal(res.candidates.length, 2);
    // Higher confidence (exact "Alfa") first, not model order.
    assert.equal(res.candidates[0].legalName, "Alfa");
    assert.ok(res.candidates[0].confidence >= res.candidates[1].confidence);
    for (const c of res.candidates) {
      assert.match(c.candidateId, /^cmp_pl_krs_\d{10}$/);
      // sourceIds only reference the candidate's own KRS source.
      assert.deepEqual(c.sourceIds, [`src_krs_${c.identifiers.krs}`]);
    }
  }
});

test("single weak match → needs_confirmation", async () => {
  const { provider } = krsProviderFrom({ "0000000001": krsCompany("0000000001", "Zupełnie Inna Nazwa") });
  const res = await identifyByName(
    query("Alfa Handel"),
    { identificationProvider: identProvider([discovered("0000000001", "Alfa Handel")]), krsProvider: provider },
    CTX,
  );
  assert.equal(res.status, "needs_confirmation");
});

test("candidate not confirmed by KRS (404) → not_found", async () => {
  const { provider, calls } = krsProviderFrom({ "0000000001": null });
  const res = await identifyByName(
    query("Alfa"),
    { identificationProvider: identProvider([discovered("0000000001", "Alfa")]), krsProvider: provider },
    CTX,
  );
  assert.equal(res.status, "not_found");
  assert.deepEqual(calls, ["0000000001"]);
});

test("no discovered candidates → not_found without any KRS call", async () => {
  const { provider, calls } = krsProviderFrom({});
  const res = await identifyByName(
    query("Alfa"),
    { identificationProvider: identProvider([]), krsProvider: provider },
    CTX,
  );
  assert.equal(res.status, "not_found");
  assert.equal(calls.length, 0);
});

test("at most MAX_KRS_VERIFICATIONS KRS calls even if more are discovered", async () => {
  const many = Array.from({ length: 8 }, (_, i) => discovered(String(i + 1).padStart(10, "0"), `C${i}`));
  const { provider, calls } = krsProviderFrom({});
  await identifyByName(query("C"), { identificationProvider: identProvider(many), krsProvider: provider }, CTX);
  assert.equal(calls.length, MAX_KRS_VERIFICATIONS);
});

test("a duplicate KRS is fetched only once", async () => {
  const dup = [discovered("0000000001", "Alfa"), discovered("0000000001", "Alfa again")];
  const { provider, calls } = krsProviderFrom({ "0000000001": krsCompany("0000000001", "Alfa") });
  await identifyByName(query("Alfa"), { identificationProvider: identProvider(dup), krsProvider: provider }, CTX);
  assert.deepEqual(calls, ["0000000001"]);
});

test("propagates an identification timeout", async () => {
  const { provider } = krsProviderFrom({});
  await assert.rejects(
    () => identifyByName(query("Alfa"), { identificationProvider: identThrowing(new CompanyIdentificationTimeoutError()), krsProvider: provider }, CTX),
    CompanyIdentificationTimeoutError,
  );
});

test("propagates an identification provider error", async () => {
  const { provider } = krsProviderFrom({});
  await assert.rejects(
    () => identifyByName(query("Alfa"), { identificationProvider: identThrowing(new CompanyIdentificationError("boom")), krsProvider: provider }, CTX),
    CompanyIdentificationError,
  );
});
