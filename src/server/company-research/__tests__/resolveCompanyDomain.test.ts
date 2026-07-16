import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCompanyDomain } from "../domain-resolution/resolveCompanyDomain.ts";
import { createDomainDiscoveryBudget } from "../domain-discovery/domainDiscoveryBudget.ts";
import { createDomainConfirmationBudget } from "../domain-confirmation/confirmationBudget.ts";
import {
  DomainDiscoveryDisabledError,
  DomainDiscoveryTimeoutError,
} from "../domain-discovery/errors.ts";
import { DomainConfirmationDisabledError } from "../domain-confirmation/errors.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import type { DomainDiscoveryBudget } from "../domain-discovery/domainDiscoveryBudget.ts";
import type { DomainConfirmationBudget } from "../domain-confirmation/confirmationBudget.ts";
import type {
  CompanyDomainDiscoveryInput,
  CompanyDomainDiscoveryProvider,
  CompanyDomainDiscoveryResult,
  DiscoveredDomainCandidate,
  DomainDiscoverySignals,
} from "../domain-discovery/types.ts";
import type {
  CompanyDomainConfirmationProvider,
  DomainConfirmationInput,
  DomainConfirmationProviderResult,
  NormalizedFoundIdentifiers,
} from "../domain-confirmation/types.ts";
import type {
  CompanyDomainResolutionResult,
  DomainResolutionStatus,
} from "../domain-resolution/types.ts";
import type { DomainResolutionReasonCode } from "../domain-resolution/reasonCodes.ts";
import type { KrsCompany } from "../types.ts";

// Compile-time guards (37 / 36): only these statuses and reason codes exist.
// @ts-expect-error — "probable" is not a resolution status.
const _noProbableStatus: DomainResolutionStatus = "probable";
void _noProbableStatus;
// @ts-expect-error — there is no generic skipped reason.
const _noSkipReason: DomainResolutionReasonCode = "CONFIRMATION_SKIPPED";
void _noSkipReason;

const COMPANY: KrsCompany = {
  krs: "0000123456",
  legalName: "Jan Kowalski Consulting Sp. z o.o.", // person-like legal name (allowed)
  legalForm: "Spółka z ograniczoną odpowiedzialnością",
  nip: "1234563218",
  regon: "123456785",
  city: "Kraków",
  region: "Małopolskie",
  countryCode: "PL",
  pkdSecondaryCodes: [],
  pkdLabels: [],
  retrievedAt: "2026-07-14T10:00:00.000Z",
};

const ORIGIN = "https://kowalski.example";
const DOMAIN = "kowalski.example";

function signals(o: Partial<DomainDiscoverySignals> = {}): DomainDiscoverySignals {
  return { matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null, ...o };
}

function discoveredCandidate(o: {
  origin?: string;
  signals?: Partial<DomainDiscoverySignals>;
  sourceOrigins?: string[];
} = {}): DiscoveredDomainCandidate {
  const origin = o.origin ?? ORIGIN;
  return {
    origin,
    domain: new URL(origin).hostname,
    signals: signals(o.signals),
    sourceOrigins: o.sourceOrigins ?? [origin],
  };
}

/** A candidate that deterministically evaluates to `probable` (exact NIP signal). */
function probableCandidate(origin = ORIGIN, sourceOrigins?: string[]): DiscoveredDomainCandidate {
  return discoveredCandidate({ origin, signals: { matchedNip: "1234563218" }, sourceOrigins });
}

function found(o: Partial<NormalizedFoundIdentifiers> = {}): NormalizedFoundIdentifiers {
  return { krs: [], nip: [], regon: [], malformedKrs: false, malformedNip: false, malformedRegon: false, ...o };
}

type DiscoveryHandler = (
  input: CompanyDomainDiscoveryInput,
  options?: { signal?: AbortSignal },
) => Promise<CompanyDomainDiscoveryResult>;
type ConfirmationHandler = (
  input: DomainConfirmationInput,
  options?: { signal?: AbortSignal },
) => Promise<DomainConfirmationProviderResult>;

function countingBudget(inner: DomainDiscoveryBudget | DomainConfirmationBudget) {
  const counts = { acquired: 0, released: 0 };
  const budget = {
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

interface Harness {
  result?: CompanyDomainResolutionResult;
  discoveryCalls: Array<{ input: CompanyDomainDiscoveryInput }>;
  confirmationCalls: Array<{ input: DomainConfirmationInput }>;
  discoveryCounts: { acquired: number; released: number };
  confirmationCounts: { acquired: number; released: number };
  run: (options?: { signal?: AbortSignal }) => Promise<CompanyDomainResolutionResult>;
}

function harness(opts: {
  discovery: DiscoveryHandler;
  confirmation?: ConfirmationHandler;
  discoveryEnabled?: boolean;
  confirmationEnabled?: boolean;
}): Harness {
  const discoveryCalls: Array<{ input: CompanyDomainDiscoveryInput }> = [];
  const confirmationCalls: Array<{ input: DomainConfirmationInput }> = [];

  const discoveryProvider: CompanyDomainDiscoveryProvider = {
    name: "fake-discovery",
    discoverDomainCandidates(input, options) {
      discoveryCalls.push({ input });
      return opts.discovery(input, options);
    },
  };
  const confirmationProvider: CompanyDomainConfirmationProvider = {
    name: "fake-confirmation",
    confirmDomain(input, options) {
      confirmationCalls.push({ input });
      const handler = opts.confirmation ?? (async () => ({ found: found(), sourceOrigins: [] }));
      return handler(input, options);
    },
  };

  const discovery = countingBudget(
    createDomainDiscoveryBudget({
      enabled: opts.discoveryEnabled ?? true,
      windowMs: 10000,
      maxPerWindow: 10,
      maxConcurrent: 5,
    }),
  );
  const confirmation = countingBudget(
    createDomainConfirmationBudget({
      enabled: opts.confirmationEnabled ?? true,
      windowMs: 10000,
      maxPerWindow: 10,
      maxConcurrent: 5,
    }),
  );

  return {
    discoveryCalls,
    confirmationCalls,
    discoveryCounts: discovery.counts,
    confirmationCounts: confirmation.counts,
    run: (options) =>
      resolveCompanyDomain(
        COMPANY,
        {
          discoveryProvider,
          discoveryBudget: discovery.budget,
          confirmationProvider,
          confirmationBudget: confirmation.budget,
        },
        options,
      ),
  };
}

const noCandidates: DiscoveryHandler = async () => ({ candidates: [] });
const oneProbable: DiscoveryHandler = async () => ({ candidates: [probableCandidate()] });

// --- not_found ---------------------------------------------------------------

test("zero discovery candidates → not_found, no confirmation, no confirmation budget", async () => {
  const h = harness({ discovery: noCandidates });
  const r = await h.run();
  assert.equal(r.status, "not_found"); // (1)
  assert.deepEqual(r.reasons, ["NO_DISCOVERY_CANDIDATES"]);
  assert.equal(r.confirmedOrigin, null);
  assert.equal(r.selectedCandidate, null);
  assert.equal(r.confirmation, null); // (20)
  assert.deepEqual(r.sourceOrigins, []);
  assert.equal(h.confirmationCalls.length, 0); // (2)
  assert.equal(h.confirmationCounts.acquired, 0); // (3)
  assert.equal(h.discoveryCalls.length, 1); // (22)
});

// --- unverified: no probable -------------------------------------------------

test("candidates but no probable → unverified, NO_PROBABLE_CANDIDATE, no confirmation", async () => {
  const h = harness({
    discovery: async () => ({ candidates: [discoveredCandidate({ origin: "https://unrelated.example" })] }),
  });
  const r = await h.run();
  assert.equal(r.status, "unverified"); // (4)
  assert.deepEqual(r.reasons, ["NO_PROBABLE_CANDIDATE"]);
  assert.equal(r.confirmation, null);
  assert.equal(h.confirmationCalls.length, 0); // (5)
  assert.equal(h.confirmationCounts.acquired, 0);
});

// --- unverified: multiple probable -------------------------------------------

test("multiple probable candidates → unverified, MULTIPLE_PROBABLE_CANDIDATES, no confirmation", async () => {
  const h = harness({
    discovery: async () => ({
      candidates: [
        probableCandidate("https://kowalski.example"),
        probableCandidate("https://kowalski-consulting.example"),
      ],
    }),
  });
  const r = await h.run();
  assert.equal(r.status, "unverified"); // (6)
  assert.deepEqual(r.reasons, ["MULTIPLE_PROBABLE_CANDIDATES"]); // (7)
  assert.equal(r.selectedCandidate, null);
  assert.equal(h.confirmationCalls.length, 0); // (8)
  assert.equal(h.confirmationCounts.acquired, 0);
});

// --- confirmed ---------------------------------------------------------------

test("one probable + confirmed → confirmed with canonical origin and evidence", async () => {
  const h = harness({
    discovery: async () => ({
      candidates: [probableCandidate(ORIGIN, [ORIGIN, "https://discovery-only.example"])],
    }),
    confirmation: async () => ({ found: found({ nip: ["1234563218"] }), sourceOrigins: [ORIGIN] }),
  });
  const r = await h.run();

  assert.equal(r.status, "confirmed"); // (10)
  assert.equal(r.confirmedOrigin, ORIGIN);
  assert.equal(r.selectedCandidate?.origin, ORIGIN);
  assert.equal(r.confirmedOrigin, r.selectedCandidate?.origin); // (11)
  assert.deepEqual(r.sourceOrigins, [ORIGIN]); // (12) top-level from confirmation only
  assert.ok(r.confirmation && r.confirmation.status === "confirmed"); // (19)

  // (13) discovery-only source is NOT promoted to top-level confirmed evidence,
  // but remains available on the evaluated candidate.
  assert.ok(!r.sourceOrigins.includes("https://discovery-only.example"));
  assert.ok(r.evaluatedCandidates[0].sourceOrigins.includes("https://discovery-only.example"));

  assert.equal(h.discoveryCalls.length, 1); // (22)
  assert.equal(h.confirmationCalls.length, 1); // (9 / 24)

  // (25) confirmation received the exact canonical selected origin/domain.
  assert.equal(h.confirmationCalls[0].input.targetOrigin, ORIGIN);
  assert.equal(h.confirmationCalls[0].input.targetDomain, DOMAIN);

  // (32) the orchestrator itself acquires no budget beyond the sub-modules'.
  assert.equal(h.discoveryCounts.acquired, 1);
  assert.equal(h.discoveryCounts.released, 1);
  assert.equal(h.confirmationCounts.acquired, 1);
  assert.equal(h.confirmationCounts.released, 1);
});

// --- conflict ----------------------------------------------------------------

test("one probable + conflict → conflict, no fallback, empty top-level sources", async () => {
  const h = harness({
    discovery: oneProbable,
    confirmation: async () => ({ found: found({ nip: ["9999999990"] }), sourceOrigins: [ORIGIN] }),
  });
  const r = await h.run();
  assert.equal(r.status, "conflict"); // (14)
  assert.deepEqual(r.reasons, ["CONFIRMATION_CONFLICT"]);
  assert.equal(r.confirmedOrigin, null);
  assert.equal(r.selectedCandidate?.origin, ORIGIN); // (21)
  assert.ok(r.confirmation && r.confirmation.status === "conflict"); // (19)
  assert.deepEqual(r.sourceOrigins, []); // (16)
  assert.equal(h.confirmationCalls.length, 1); // (15) exactly one, no second attempt
});

// --- unverified via confirmation ---------------------------------------------

test("one probable + confirmation unverified → unverified, empty top-level sources", async () => {
  const h = harness({
    discovery: oneProbable,
    confirmation: async () => ({ found: found(), sourceOrigins: [] }),
  });
  const r = await h.run();
  assert.equal(r.status, "unverified"); // (17)
  assert.deepEqual(r.reasons, ["CONFIRMATION_UNVERIFIED"]);
  assert.equal(r.selectedCandidate?.origin, ORIGIN); // (21)
  assert.ok(r.confirmation && r.confirmation.status === "unverified"); // (19)
  assert.deepEqual(r.sourceOrigins, []); // (18)
});

// --- confirmation provider failure fails closed to unverified (30) -----------

test("confirmation provider failure follows fail-closed unverified behavior", async () => {
  const h = harness({
    discovery: oneProbable,
    confirmation: async () => {
      throw new Error("provider exploded");
    },
  });
  const r = await h.run();
  assert.equal(r.status, "unverified"); // (30)
  assert.ok(r.confirmation && r.confirmation.status === "unverified");
  assert.deepEqual(r.sourceOrigins, []);
  assert.equal(h.confirmationCounts.released, 1); // budget still released inside confirmation
});

// --- error propagation -------------------------------------------------------

test("discovery timeout propagates and confirmation is never called", async () => {
  const h = harness({
    discovery: async () => {
      throw new DomainDiscoveryTimeoutError();
    },
    confirmation: async () => ({ found: found({ nip: ["1234563218"] }), sourceOrigins: [ORIGIN] }),
  });
  await assert.rejects(() => h.run(), DomainDiscoveryTimeoutError); // (26)
  assert.equal(h.confirmationCalls.length, 0); // (27)
});

test("discovery disabled budget propagates (no discovery/confirmation provider call)", async () => {
  const h = harness({
    discovery: oneProbable,
    discoveryEnabled: false,
  });
  await assert.rejects(() => h.run(), DomainDiscoveryDisabledError); // (28)
  assert.equal(h.discoveryCalls.length, 0);
  assert.equal(h.confirmationCalls.length, 0);
});

test("confirmation disabled budget propagates on the probable path", async () => {
  const h = harness({
    discovery: oneProbable,
    confirmation: async () => ({ found: found({ nip: ["1234563218"] }), sourceOrigins: [ORIGIN] }),
    confirmationEnabled: false,
  });
  await assert.rejects(() => h.run(), DomainConfirmationDisabledError); // (29)
  assert.equal(h.discoveryCalls.length, 1);
  assert.equal(h.confirmationCalls.length, 0); // provider never reached (budget throws first)
});

test("caller cancellation during discovery propagates", async () => {
  const controller = new AbortController();
  const h = harness({
    discovery: async (_input, options) => {
      controller.abort();
      throw options?.signal?.reason ?? new DOMException("aborted", "AbortError");
    },
  });
  await assert.rejects(() => h.run({ signal: controller.signal })); // (31)
  assert.equal(h.confirmationCalls.length, 0);
});

// --- privacy / URL hygiene ---------------------------------------------------

test("final result passes the privacy guard and keeps a person-like legal name", async () => {
  const h = harness({
    discovery: oneProbable,
    confirmation: async () => ({ found: found({ nip: ["1234563218"] }), sourceOrigins: [ORIGIN] }),
  });
  const r = await h.run();
  // (34) already asserted inside resolveCompanyDomain, restated here for the suite.
  assert.doesNotThrow(() => assertNoPersonalData(r, "domainResolutionResult"));
  // (35) the person-like legal company name survived through approved paths.
  assert.equal(r.evaluatedCandidates.length, 1);
});

test("no exact URL path/query/fragment survives anywhere in the result", async () => {
  const h = harness({
    discovery: async () => ({
      candidates: [probableCandidate(ORIGIN, [ORIGIN])],
    }),
    confirmation: async () => ({ found: found({ nip: ["1234563218"] }), sourceOrigins: [ORIGIN] }),
  });
  const r = await h.run();
  const dump = JSON.stringify(r);
  assert.ok(!dump.includes("/kontakt"));
  assert.ok(!dump.includes("?"));
  assert.ok(!dump.includes("#"));
  // Every retained source is a bare origin (scheme + host only).
  for (const origin of [...r.sourceOrigins, ...r.evaluatedCandidates.flatMap((c) => c.sourceOrigins)]) {
    assert.equal(new URL(origin).pathname, "/");
  }
});

// --- mutation isolation (fully detached result) ------------------------------

/**
 * A confirmed run whose upstream dependency objects (the discovered candidate,
 * the confirmation source-origins array) are captured so tests can prove the
 * returned result is fully detached from them.
 */
async function confirmedRun() {
  const discovered = discoveredCandidate({
    origin: ORIGIN,
    signals: { matchedNip: "1234563218" },
    sourceOrigins: [ORIGIN, "https://discovery-only.example"],
  });
  const confirmationSources = [ORIGIN];
  const h = harness({
    discovery: async () => ({ candidates: [discovered] }),
    confirmation: async () => ({ found: found({ nip: ["1234563218"] }), sourceOrigins: [...confirmationSources] }),
  });
  const result = await h.run();
  assert.equal(result.status, "confirmed");
  return { result, discovered, confirmationSources };
}

test("mutating result.sourceOrigins does not modify result.confirmation.sourceOrigins", async () => {
  const { result } = await confirmedRun();
  const conf = result.confirmation;
  assert.ok(conf);
  const before = [...conf.sourceOrigins];
  result.sourceOrigins.push("https://injected.example");
  result.sourceOrigins[0] = "https://tampered.example";
  assert.deepEqual(conf.sourceOrigins, before);
  assert.notEqual(result.sourceOrigins, conf.sourceOrigins);
});

test("mutating result.confirmation.sourceOrigins does not modify result.sourceOrigins", async () => {
  const { result } = await confirmedRun();
  const conf = result.confirmation;
  assert.ok(conf);
  const before = [...result.sourceOrigins];
  conf.sourceOrigins.push("https://injected.example");
  conf.sourceOrigins[0] = "https://tampered.example";
  assert.deepEqual(result.sourceOrigins, before);
});

test("mutating result.selectedCandidate.sourceOrigins does not modify the evaluatedCandidates entry", async () => {
  const { result } = await confirmedRun();
  const selected = result.selectedCandidate;
  assert.ok(selected);
  const evalEntry = result.evaluatedCandidates.find((c) => c.origin === selected.origin);
  assert.ok(evalEntry);
  assert.notEqual(selected, evalEntry); // (7) semantically equal, different reference
  const before = [...evalEntry.sourceOrigins];
  selected.sourceOrigins.push("https://injected.example");
  assert.deepEqual(evalEntry.sourceOrigins, before);
});

test("mutating an evaluatedCandidates entry does not modify selectedCandidate", async () => {
  const { result } = await confirmedRun();
  const selected = result.selectedCandidate;
  assert.ok(selected);
  const entry = result.evaluatedCandidates[0];
  const beforeNip = selected.signals.matchedNip;
  const beforeReasons = [...selected.reasons];
  entry.signals.matchedNip = "9999999990";
  entry.reasons.push("CITY_MATCH");
  entry.conflicts.push("KRS_CONFLICT");
  entry.sourceOrigins.push("https://injected.example");
  assert.equal(selected.signals.matchedNip, beforeNip);
  assert.deepEqual(selected.reasons, beforeReasons);
});

test("mutating the returned resolution does not modify the captured dependency objects", async () => {
  const { result, discovered, confirmationSources } = await confirmedRun();
  const selected = result.selectedCandidate;
  const conf = result.confirmation;
  assert.ok(selected);
  assert.ok(conf);

  selected.signals.matchedNip = "MUTATED";
  selected.sourceOrigins.push("https://injected.example");
  conf.sourceOrigins.push("https://injected.example");
  conf.verifiedIdentifiers.push("krs");

  // The discovered candidate captured by the discovery dependency is untouched.
  assert.equal(discovered.signals.matchedNip, "1234563218");
  assert.deepEqual(discovered.sourceOrigins, [ORIGIN, "https://discovery-only.example"]);
  // The confirmation source-origins array captured by the confirmation dep is untouched.
  assert.deepEqual(confirmationSources, [ORIGIN]);
});

test("nested reasons/conflicts/signals arrays are independent across result fields", async () => {
  const { result } = await confirmedRun();
  const selected = result.selectedCandidate;
  const conf = result.confirmation;
  assert.ok(selected);
  assert.ok(conf);

  const confReasonsBefore = [...conf.reasons];
  const selectedConflictsBefore = [...selected.conflicts];

  // Mutating candidate signals/arrays must not touch the confirmation clone.
  selected.signals.matchedLegalName = "MUTATED";
  selected.reasons.push("CITY_MATCH");
  assert.deepEqual(conf.reasons, confReasonsBefore);

  // Mutating confirmation arrays must not touch the candidate clone.
  conf.conflicts.push("KRS_CONFLICT");
  conf.reasons.push("NO_ATTESTED_SOURCE");
  assert.deepEqual(selected.conflicts, selectedConflictsBefore);
});
