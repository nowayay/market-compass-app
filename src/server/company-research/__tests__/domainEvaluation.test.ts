import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCompanyDomains } from "../domain-evaluation/evaluateCompanyDomains.ts";
import { evaluateDomainCandidate } from "../domain-evaluation/evaluateDomainCandidate.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { companyResearchResponseSchema } from "../../../contracts/companyResearchSchema.ts";
import type {
  CompanyDomainEvaluationStatus,
  DomainCandidateStatus,
  DomainEvaluationCompany,
} from "../domain-evaluation/types.ts";
import type { DiscoveredDomainCandidate, DomainDiscoverySignals } from "../domain-discovery/types.ts";

// Compile-time guards: "confirmed" must not exist in the evaluation status types.
// @ts-expect-error — "confirmed" is not a valid candidate evaluation status.
const _noConfirmedCandidate: DomainCandidateStatus = "confirmed";
void _noConfirmedCandidate;
// @ts-expect-error — "confirmed" is not a valid overall evaluation status.
const _noConfirmedOverall: CompanyDomainEvaluationStatus = "confirmed";
void _noConfirmedOverall;

function company(o: Partial<DomainEvaluationCompany> = {}): DomainEvaluationCompany {
  return {
    legalName: "Market Compass Sp. z o.o.",
    aliases: [],
    krs: "0000123456",
    nip: "1234563218",
    regon: "123456785",
    city: "Warszawa",
    region: "Mazowieckie",
    countryCode: "PL",
    legalForm: "Spółka z ograniczoną odpowiedzialnością",
    ...o,
  };
}

function signals(o: Partial<DomainDiscoverySignals> = {}): DomainDiscoverySignals {
  return { matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null, ...o };
}

function candidate(o: {
  origin?: string;
  domain?: string;
  signals?: Partial<DomainDiscoverySignals>;
  sourceOrigins?: string[];
} = {}): DiscoveredDomainCandidate {
  const origin = o.origin ?? "https://marketcompass.pl";
  return {
    origin,
    domain: o.domain ?? new URL(origin).hostname,
    signals: signals(o.signals),
    sourceOrigins: o.sourceOrigins ?? [origin],
  };
}

const one = (c: DiscoveredDomainCandidate, co: DomainEvaluationCompany = company()) =>
  evaluateDomainCandidate(co, c);

// --- No "confirmed" anywhere -------------------------------------------------
test("an exact KRS/NIP/REGON discovery signal never produces confirmed", () => {
  const krs = one(candidate({ domain: "x.example", signals: { matchedKrs: "0000123456" } }));
  const nip = one(candidate({ domain: "x.example", signals: { matchedNip: "1234563218" } }));
  const regon = one(candidate({ domain: "x.example", signals: { matchedRegon: "123456785" } }));
  for (const c of [krs, nip, regon]) {
    assert.notEqual(c.status, "confirmed");
    assert.equal(c.status, "probable");
  }
  assert.ok(krs.reasons.includes("KRS_DISCOVERY_SIGNAL_MATCH"));
  assert.ok(nip.reasons.includes("NIP_DISCOVERY_SIGNAL_MATCH"));
  assert.ok(regon.reasons.includes("REGON_DISCOVERY_SIGNAL_MATCH"));
});

test("no candidate or overall status is ever 'confirmed' across a battery of cases", () => {
  const cases: DiscoveredDomainCandidate[][] = [
    [candidate({ signals: { matchedKrs: "0000123456" } })],
    [candidate({ signals: { matchedKrs: "0000999999" } })],
    [candidate({ signals: { matchedLegalName: "Market Compass", matchedCity: "Warszawa" } })],
    [candidate(), candidate({ origin: "https://x.example", domain: "x.example" })],
    [],
  ];
  for (const list of cases) {
    const r = evaluateCompanyDomains(company(), list);
    assert.notEqual(r.status, "confirmed");
    for (const c of r.candidates) assert.notEqual(c.status, "confirmed");
  }
});

// --- Identifier discovery signals → probable (Path A) ------------------------
test("an exact discovery identifier signal can produce probable (selected)", () => {
  const r = evaluateCompanyDomains(company(), [candidate({ signals: { matchedKrs: "0000123456" } })]);
  assert.equal(r.status, "probable");
  assert.ok(r.selectedCandidate);
  assert.equal(r.selectedCandidate.status, "probable");
});

test("multiple identifier matches score higher deterministically", () => {
  const single = one(candidate({ domain: "x.example", signals: { matchedKrs: "0000123456" } }));
  const multi = one(candidate({ domain: "x.example", signals: { matchedKrs: "0000123456", matchedNip: "1234563218", matchedRegon: "123456785" } }));
  assert.ok(multi.score > single.score, `${multi.score} > ${single.score}`);
});

// --- Conflicts and malformed → rejected (fail-closed) ------------------------
test("conflicting KRS / NIP / REGON → rejected", () => {
  assert.equal(one(candidate({ signals: { matchedKrs: "0000999999" } })).status, "rejected");
  assert.equal(one(candidate({ signals: { matchedNip: "9999999999" } })).status, "rejected");
  assert.equal(one(candidate({ signals: { matchedRegon: "999999999" } })).status, "rejected");
});

test("a conflict cannot be offset by name, city, domain or score", () => {
  const c = one(candidate({
    domain: "marketcompass.pl",
    signals: { matchedKrs: "0000999999", matchedLegalName: "Market Compass Sp. z o.o.", matchedCity: "Warszawa" },
  }));
  assert.equal(c.status, "rejected");
  assert.ok(c.conflicts.includes("KRS_CONFLICT"));
  assert.equal(c.score, 0);
});

test("malformed KRS / NIP / REGON signals are rejected (fail-closed)", () => {
  assert.ok(one(candidate({ signals: { matchedKrs: "12345/67890" } })).conflicts.includes("MALFORMED_KRS_SIGNAL"));
  assert.ok(one(candidate({ signals: { matchedNip: "12" } })).conflicts.includes("MALFORMED_NIP_SIGNAL"));
  assert.ok(one(candidate({ signals: { matchedRegon: "12" } })).conflicts.includes("MALFORMED_REGON_SIGNAL"));
});

// --- Identifier normalization: arbitrary letters/punctuation rejected --------
test("arbitrary letters/punctuation cannot be stripped into a valid NIP", () => {
  for (const bad of ["ABC1234567890XYZ", "NIP=1234567890", "12345/67890"]) {
    const c = one(candidate({ signals: { matchedNip: bad } }));
    assert.equal(c.status, "rejected");
    assert.ok(c.conflicts.includes("MALFORMED_NIP_SIGNAL"), `expected malformed: ${bad}`);
  }
});

test("arbitrary letters/punctuation cannot be stripped into a valid REGON", () => {
  for (const bad of ["REGON:123456789", "12A456789", "1234/56789"]) {
    const c = one(candidate({ signals: { matchedRegon: bad } }));
    assert.equal(c.status, "rejected");
    assert.ok(c.conflicts.includes("MALFORMED_REGON_SIGNAL"), `expected malformed: ${bad}`);
  }
});

test("optional PL prefix and separators are accepted for NIP", () => {
  const co = company({ nip: "1234567890" });
  for (const good of ["1234567890", "123-456-78-90", "PL 123-456-78-90", "pl1234567890"]) {
    const c = one(candidate({ domain: "x.example", signals: { matchedNip: good } }), co);
    assert.ok(c.reasons.includes("NIP_DISCOVERY_SIGNAL_MATCH"), `expected match: ${good}`);
    assert.equal(c.status, "probable");
  }
});

test("REGON accepts spaces and hyphens", () => {
  const co = company({ regon: "123456789" });
  for (const good of ["123456789", "123-456-789", "123 456 789"]) {
    const c = one(candidate({ domain: "x.example", signals: { matchedRegon: good } }), co);
    assert.ok(c.reasons.includes("REGON_DISCOVERY_SIGNAL_MATCH"), `expected match: ${good}`);
  }
});

// --- Missing identifiers are not conflicts -----------------------------------
test("missing identifiers are not conflicts", () => {
  const c = one(candidate({ origin: "https://unrelated.pl", domain: "unrelated.pl" }));
  assert.equal(c.conflicts.length, 0);
  assert.equal(c.status, "unverified");
});

// --- Name / city / domain (Path B and supporting-only) -----------------------
test("legal-form tokens ignored; diacritics normalized; exact/strong name", () => {
  assert.ok(one(candidate({ domain: "x.example", signals: { matchedLegalName: "MARKET COMPASS S.A." } })).reasons.includes("LEGAL_NAME_EXACT_MATCH"));
  assert.ok(one(candidate({ domain: "x.example", signals: { matchedLegalName: "Market Compass Trading" } })).reasons.includes("LEGAL_NAME_STRONG_MATCH"));
  const city = evaluateDomainCandidate(company({ city: "Kraków" }), candidate({ origin: "https://unrelated.pl", domain: "unrelated.pl", signals: { matchedCity: "KRAKOW" } }));
  assert.ok(city.reasons.includes("CITY_MATCH"));
});

test("weak name / city-only / domain-only do not reach probable", () => {
  assert.equal(one(candidate({ domain: "marketcompass.pl", signals: { matchedLegalName: "Zupełnie Inna Firma", matchedCity: "Warszawa" } })).status, "unverified");
  assert.equal(one(candidate({ origin: "https://unrelated.pl", domain: "unrelated.pl", signals: { matchedCity: "Warszawa" } })).status, "unverified");
  assert.equal(one(candidate({ domain: "marketcompass.pl" })).status, "unverified");
});

test("Path B: strong name + city + domain-token, no identifiers → probable", () => {
  const c = one(candidate({ domain: "marketcompass.pl", signals: { matchedLegalName: "Market Compass", matchedCity: "Warszawa" } }));
  assert.equal(c.status, "probable");
});

// --- Selection & sorting -----------------------------------------------------
test("exactly one probable → selected", () => {
  const r = evaluateCompanyDomains(company(), [candidate({ signals: { matchedKrs: "0000123456" } })]);
  assert.equal(r.status, "probable");
  assert.equal(r.selectedCandidate?.origin, "https://marketcompass.pl");
});

test("multiple probable → unverified, no selection", () => {
  const r = evaluateCompanyDomains(company(), [
    candidate({ origin: "https://a.example", domain: "a.example", signals: { matchedKrs: "0000123456" } }),
    candidate({ origin: "https://b.example", domain: "b.example", signals: { matchedNip: "1234563218" } }),
  ]);
  assert.equal(r.status, "unverified");
  assert.equal(r.selectedCandidate, null);
  assert.ok(r.reasons.includes("MULTIPLE_PROBABLE_CANDIDATES"));
});

test("rejected candidates are never selected", () => {
  const r = evaluateCompanyDomains(company(), [
    candidate({ origin: "https://bad.example", domain: "bad.example", signals: { matchedKrs: "0000999999" } }),
    candidate({ origin: "https://good.example", domain: "good.example", signals: { matchedKrs: "0000123456" } }),
  ]);
  assert.equal(r.status, "probable");
  assert.equal(r.selectedCandidate?.origin, "https://good.example");
});

test("sorting is deterministic and independent of input order", () => {
  const c1 = candidate({ origin: "https://z.example", domain: "z.example", signals: { matchedKrs: "0000123456" } });
  const c2 = candidate({ origin: "https://m.example", domain: "m.example" });
  const c3 = candidate({ origin: "https://bad.example", domain: "bad.example", signals: { matchedKrs: "0000999999" } });
  const forward = evaluateCompanyDomains(company(), [c1, c2, c3]);
  const reversed = evaluateCompanyDomains(company(), [c3, c2, c1]);
  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward.candidates.map((c) => c.status), ["probable", "unverified", "rejected"]);
});

// --- Privacy, origins, public-contract isolation, purity ---------------------
test("a legal name containing a person's name remains valid (no privacy throw)", () => {
  const r = evaluateCompanyDomains(company({ legalName: "Jan Kowalski Transport Sp. z o.o." }), [
    candidate({ domain: "jankowalskitransport.pl", signals: { matchedKrs: "0000123456", matchedLegalName: "Prezes Jan Kowalski Spółka z o.o." } }),
  ]);
  assert.equal(r.status, "probable");
  assert.doesNotThrow(() => assertNoPersonalData(r, "domainEvaluationResult"));
});

test("origin-only sourceOrigins preserved; exact page URLs dropped", () => {
  const preserved = one(candidate({ signals: { matchedKrs: "0000123456" }, sourceOrigins: ["https://marketcompass.pl"] }));
  assert.deepEqual(preserved.sourceOrigins, ["https://marketcompass.pl"]);

  const r = evaluateCompanyDomains(company(), [
    candidate({ signals: { matchedKrs: "0000123456" }, sourceOrigins: ["https://marketcompass.pl/o-nas?ref=x#top"] }),
  ]);
  const dump = JSON.stringify(r);
  assert.ok(!dump.includes("/o-nas") && !dump.includes("ref=x") && !dump.includes("#top"));
  assert.deepEqual(r.candidates[0].sourceOrigins, []);
});

test("the internal result is not a public Company Research response", () => {
  const r = evaluateCompanyDomains(company(), [candidate({ signals: { matchedKrs: "0000123456" } })]);
  assert.ok(!companyResearchResponseSchema.safeParse(r).success);
});

test("evaluation performs no network / OpenAI call", () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("network call not allowed in evaluation");
  }) as typeof fetch;
  try {
    const r = evaluateCompanyDomains(company(), [candidate({ signals: { matchedKrs: "0000123456" } })]);
    assert.equal(r.status, "probable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
