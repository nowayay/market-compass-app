import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleCompanyProfile } from "../profile-assembly/assembleCompanyProfile.ts";
import { ProfileAssemblyInvariantError, ProfileAssemblyPrivacyError } from "../profile-assembly/errors.ts";
import { assertNoPersonalData } from "../privacy/assertNoPersonalData.ts";
import { COMPANY_RESEARCH_VERSION } from "../../../contracts/companyResearch.ts";
import {
  AT,
  CLOCK_AT,
  clock,
  completedBusiness,
  confirmedResolution,
  krsCompany,
  notFoundResolution,
  ORIGIN,
  DOMAIN,
  partialBusiness,
  skippedBusiness,
  unverifiedBusiness,
  unverifiedResolution,
} from "./profileAssemblyFixtures.ts";
import type { CompanyProfileAssemblyInput } from "../profile-assembly/types.ts";

function assemble(input: CompanyProfileAssemblyInput) {
  return assembleCompanyProfile(input, { now: clock() });
}

// (1) full KRS + confirmed domain + completed business research.
test("complete: KRS + confirmed domain + completed research", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  assert.equal(r.status, "complete");
  assert.equal(r.profile.website.verified, true);
  assert.equal(r.profile.industry.description, "Tworzenie oprogramowania na zamówienie");
  // Business list facts are canonically ordered (by normalized key).
  assert.deepEqual(r.profile.business.productsServices, ["Aplikacje mobilne", "Aplikacje webowe"]);
  assert.ok(typeof r.profile.business.description === "string");
  assert.ok(r.reasons.includes("BUSINESS_FACTS_COMPLETE"));
  assert.ok(r.reasons.includes("WEBSITE_CONFIRMED"));
  assert.ok(r.reasons.includes("DESCRIPTION_GENERATED"));
});

// (2) full KRS + confirmed domain + partial research.
test("partial: a missing business category", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: partialBusiness(),
  });
  assert.equal(r.status, "partial");
  assert.deepEqual(r.profile.business.customerSegments, []);
  assert.ok(r.reasons.includes("BUSINESS_FACTS_PARTIAL"));
});

// (3) KRS + confirmed domain + unverified business research.
test("partial: confirmed website but unverified research", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: unverifiedBusiness(),
  });
  assert.equal(r.status, "partial");
  assert.equal(r.profile.website.verified, true);
  assert.deepEqual(r.profile.business.productsServices, []);
  assert.equal(r.profile.business.description, undefined);
  assert.ok(r.reasons.includes("BUSINESS_FACTS_UNVERIFIED"));
  assert.ok(r.reasons.includes("DESCRIPTION_OMITTED"));
  // A website source is created from the confirmed domain with the injected clock.
  const web = r.sources.find((s) => s.type === "official_company_website");
  assert.ok(web);
  assert.equal(web?.retrievedAt, CLOCK_AT);
});

// (4) KRS + non-confirmed domain + skipped research  &  (5) legal-only profile.
test("legal_only: non-confirmed domain + skipped research", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: notFoundResolution(),
    businessResearch: skippedBusiness(),
  });
  assert.equal(r.status, "legal_only");
  assert.equal(r.profile.website.verified, false);
  assert.equal(r.profile.website.url, undefined);
  assert.equal(r.profile.business.description, undefined);
  assert.equal(r.sources.length, 1); // KRS only
  assert.equal(r.sources[0].provider, "krs");
  assert.ok(r.reasons.includes("BUSINESS_RESEARCH_SKIPPED"));
  assert.ok(r.reasons.includes("WEBSITE_NOT_CONFIRMED"));
});

// (6) KRS legal fields are never overwritten.
test("KRS legal fields are authoritative and never overwritten", () => {
  const company = krsCompany();
  const r = assemble({
    company,
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  assert.equal(r.profile.identity.legalName, company.legalName);
  assert.equal(r.profile.identity.identifiers.krs, company.krs);
  assert.equal(r.profile.identity.identifiers.nip, company.nip);
  assert.equal(r.profile.identity.identifiers.regon, company.regon);
  assert.equal(r.profile.identity.legalForm, company.legalForm);
  assert.equal(r.profile.location.city, company.city);
  assert.equal(r.profile.location.region, company.region);
  assert.equal(r.profile.location.countryCode, company.countryCode);
});

// (7) KRS industry codes/labels remain unchanged.
test("KRS industry codes/labels remain unchanged", () => {
  const company = krsCompany();
  const r = assemble({
    company,
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  assert.equal(r.profile.industry.primaryCode, company.pkdPrimaryCode);
  assert.deepEqual(r.profile.industry.secondaryCodes, company.pkdSecondaryCodes);
  assert.deepEqual(r.profile.industry.labels, company.pkdLabels);
});

// (8) business research populates only the four allowed fields.
test("business research populates only the four allowed fields", () => {
  const bare = krsCompany({ pkdPrimaryCode: "10.11.Z", pkdSecondaryCodes: ["10.12.Z"], pkdLabels: ["Label"] });
  const r = assemble({
    company: bare,
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  // industry codes/labels come from KRS; only industry.description is web-populated.
  assert.equal(r.profile.industry.primaryCode, "10.11.Z");
  assert.deepEqual(r.profile.industry.secondaryCodes, ["10.12.Z"]);
  assert.deepEqual(r.profile.industry.labels, ["Label"]);
  assert.ok(r.profile.industry.description); // the one allowed industry overlay
  assert.ok(r.profile.business.customerSegments.length > 0);
  assert.ok(r.profile.business.operatingMarkets.length > 0);
});

// (9) confirmed website uses the exact canonical confirmed origin.
test("confirmed website uses the exact canonical confirmed origin", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  assert.equal(r.profile.website.url, ORIGIN);
  assert.equal(r.profile.website.domain, DOMAIN);
});

// (10) an unconfirmed domain never produces a verified website.
test("unconfirmed domain never produces a verified website", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: unverifiedResolution(),
    businessResearch: skippedBusiness(),
  });
  assert.equal(r.profile.website.verified, false);
  assert.equal(r.profile.website.url, undefined);
  assert.equal(r.profile.website.domain, undefined);
});

// (11) a malformed confirmed resolution throws (never a silent downgrade).
test("malformed confirmed resolution throws", () => {
  const broken = confirmedResolution();
  broken.confirmedOrigin = null; // impossible: confirmed with no origin
  assert.throws(
    () => assemble({ company: krsCompany(), domainResolution: broken, businessResearch: skippedBusiness() }),
    ProfileAssemblyInvariantError,
  );
});

// (12) a business researchedOrigin mismatch throws.
test("business researchedOrigin mismatch throws", () => {
  const business = completedBusiness();
  business.researchedOrigin = "https://other.example";
  assert.throws(
    () => assemble({ company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: business }),
    ProfileAssemblyInvariantError,
  );
});

// (13) accepted business facts require valid current sources/evidence.
test("accepted business facts without sources throws", () => {
  const business = completedBusiness();
  business.sources = [];
  assert.throws(
    () => assemble({ company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: business }),
    ProfileAssemblyInvariantError,
  );
});

// (14) unverified/skipped research cannot smuggle facts.
test("unverified research carrying facts throws", () => {
  const business = unverifiedBusiness();
  business.facts.productsServices = ["Smuggled"]; // impossible for unverified
  assert.throws(
    () => assemble({ company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: business }),
    ProfileAssemblyInvariantError,
  );
});

// (20) the website source is origin-only.
test("website source is origin-only", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: unverifiedBusiness(),
  });
  const web = r.sources.find((s) => s.type === "official_company_website");
  assert.ok(web);
  assert.equal(web?.url, ORIGIN);
  assert.equal(web?.domain, DOMAIN);
  assert.equal(new URL(web!.url!).pathname, "/");
});

// (21) no discovery-only candidate source is promoted to a returned source.
test("discovery-only candidate sources are never promoted", () => {
  const resolution = confirmedResolution();
  resolution.evaluatedCandidates = [
    ...resolution.evaluatedCandidates,
    {
      origin: "https://discovery-only.example",
      domain: "discovery-only.example",
      status: "rejected",
      score: 0,
      reasons: [],
      conflicts: [],
      sourceOrigins: ["https://discovery-only.example"],
      signals: { matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null },
    },
  ];
  const r = assemble({ company: krsCompany(), domainResolution: resolution, businessResearch: unverifiedBusiness() });
  assert.ok(!r.sources.some((s) => s.domain === "discovery-only.example"));
});

// (26) every retained evidence source id resolves to a returned source.
// (30/31) KRS + business evidence preserved.  (32) exact target paths.
test("evidence is referentially valid and preserves KRS + business evidence", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  const sourceIds = new Set(r.sources.map((s) => s.id));
  for (const e of r.evidence) {
    assert.ok(e.sourceIds.length >= 1);
    for (const sid of e.sourceIds) assert.ok(sourceIds.has(sid), `missing source ${sid}`);
  }
  const paths = new Set(r.evidence.map((e) => e.target.path));
  assert.ok(paths.has("company.identity.legalName")); // KRS preserved
  assert.ok(paths.has("company.industry.description")); // business preserved
  assert.ok(paths.has("company.website.url")); // website (existing contract path)
  assert.ok(paths.has("company.business.description")); // description (existing contract path)
});

// (28) description evidence uses honest deterministic derivation.
// (29) description evidence references only material component sources.
test("description evidence: derived derivation + component sources only", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  const desc = r.evidence.find((e) => e.target.path === "company.business.description");
  assert.ok(desc);
  assert.equal(desc?.derivation, "derived");
  assert.equal(desc?.support, "corroborating");
  assert.equal(desc?.confidence, 0.5);
  // The legal name (KRS) and the business facts (web) both feed the description.
  const krsId = r.sources.find((s) => s.provider === "krs")!.id;
  const webId = r.sources.find((s) => s.type === "official_company_website")!.id;
  assert.deepEqual([...desc!.sourceIds].sort(), [krsId, webId].sort());
});

// (33) stable IDs and output are independent of input ordering.
test("assembly is deterministic and order-independent", () => {
  const build = () => ({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  const a = assemble(build());
  const shuffled = build();
  shuffled.businessResearch.sources = [...shuffled.businessResearch.sources].reverse();
  shuffled.businessResearch.evidence = [...shuffled.businessResearch.evidence].reverse();
  const b = assemble(shuffled);
  assert.deepEqual(a, b);
});

// (34/35) the result is fully detached; mutating it never touches an input.
test("result is detached from every input (mutation isolation)", () => {
  const company = krsCompany();
  const business = completedBusiness();
  const r = assemble({ company, domainResolution: confirmedResolution(), businessResearch: business });

  // Different array identities.
  assert.notEqual(r.profile.industry.secondaryCodes, company.pkdSecondaryCodes);
  assert.notEqual(r.profile.business.productsServices, business.facts.productsServices);

  // Mutating the result does not change the inputs.
  r.profile.industry.secondaryCodes.push("99.99.Z");
  r.profile.business.productsServices.push("Injected");
  r.sources.push({ ...r.sources[0], id: "x" });
  r.evidence[0].sourceIds.push("x");
  assert.deepEqual(company.pkdSecondaryCodes, ["63.11.Z"]);
  assert.deepEqual(business.facts.productsServices, ["Aplikacje webowe", "Aplikacje mobilne"]);

  // Mutating the inputs after assembly does not change the result.
  const before = JSON.parse(JSON.stringify(r.profile.business.customerSegments));
  business.facts.customerSegments.push("Late");
  assert.deepEqual(r.profile.business.customerSegments, before);
});

// (36) the final privacy guard passes for a clean assembled result.
test("final privacy guard passes on clean data", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  assert.doesNotThrow(() => assertNoPersonalData(r.profile, "company"));
  assert.doesNotThrow(() => assertNoPersonalData({ s: r.sources, e: r.evidence }, "root"));
});

// (37) a person-like legal company name remains allowed on the legal-name path.
test("person-like legal company name remains allowed", () => {
  const company = krsCompany({ legalName: "Jan Kowalski Consulting Sp. z o.o." });
  const r = assemble({ company, domainResolution: confirmedResolution(), businessResearch: completedBusiness() });
  assert.equal(r.profile.identity.legalName, "Jan Kowalski Consulting Sp. z o.o.");
  assert.ok(r.profile.business.description?.startsWith("Jan Kowalski Consulting Sp. z o.o."));
});

// (38) contact/person data anywhere in the assembled result is rejected.
test("personal data in a business fact is rejected", () => {
  const business = completedBusiness({ industryDescription: "Obsługa klienta 500 600 700 800" });
  assert.throws(
    () => assemble({ company: krsCompany(), domainResolution: confirmedResolution(), businessResearch: business }),
    ProfileAssemblyPrivacyError,
  );
});

// (39) the public contract version constant is untouched by this stage.
test("public contract version is unchanged", () => {
  assert.equal(COMPANY_RESEARCH_VERSION, "1.0.0-stage3");
});

// Website evidence honesty: origin-level, corroborating (never direct).
test("website evidence is corroborating (origin-level, not page-level)", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: unverifiedBusiness(),
  });
  const web = r.evidence.find((e) => e.target.path === "company.website.url");
  assert.ok(web);
  assert.equal(web?.support, "corroborating");
  assert.equal(web?.confidence, 0.5);
  assert.equal(web?.verifiedAt, CLOCK_AT); // the newly created source's retrievedAt
});

// A confirmed origin already covered by a business source is reused (no duplicate).
test("no duplicate website source for the same normalized origin", () => {
  const r = assemble({
    company: krsCompany(),
    domainResolution: confirmedResolution(),
    businessResearch: completedBusiness(),
  });
  const websiteSources = r.sources.filter((s) => s.type === "official_company_website");
  assert.equal(websiteSources.length, 1);
  // Reused business source keeps the business retrievedAt, not the clock.
  assert.equal(websiteSources[0].retrievedAt, AT);
});
