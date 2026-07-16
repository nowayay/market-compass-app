import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DomainDiscoveryBusyError,
  DomainDiscoveryDisabledError,
  DomainDiscoveryError,
  DomainDiscoveryErrorBase,
  DomainDiscoveryRateLimitedError,
  DomainDiscoveryTimeoutError,
  InvalidDomainDiscoveryResponseError,
} from "../domain-discovery/errors.ts";
import { CompanyResearchError } from "../errors.ts";
import type { DomainDiscoveryErrorCode } from "../domain-discovery/errors.ts";
import type { CompanyResearchErrorCode } from "../../../contracts/companyResearch.ts";

// Compile-time guard: a domain-discovery code must NOT be assignable to the
// public union. `@ts-expect-error` REQUIRES this assignment to be a type error;
// if a domain code were ever re-added to the public union the directive would
// become unused and typecheck (npm run test:typecheck) would fail.
// @ts-expect-error domain-discovery codes are intentionally not part of the public union.
const _publicUnionExcludesDomainCode: CompanyResearchErrorCode = "COMPANY_DOMAIN_DISCOVERY_DISABLED";
void _publicUnionExcludesDomainCode;

const ALL = [
  new DomainDiscoveryDisabledError(),
  new DomainDiscoveryRateLimitedError(),
  new DomainDiscoveryBusyError(),
  new DomainDiscoveryTimeoutError(),
  new DomainDiscoveryError("provider failed"),
  new InvalidDomainDiscoveryResponseError(),
];

test("domain-discovery errors are typed and internally distinguishable", () => {
  // Each is its own class AND shares the internal base.
  for (const err of ALL) {
    assert.ok(err instanceof DomainDiscoveryErrorBase);
    assert.equal(typeof err.code, "string");
    assert.equal(typeof err.publicMessage, "string");
  }
  // Distinguishable by constructor + by code.
  const codes = ALL.map((e) => e.code);
  assert.equal(new Set(codes).size, ALL.length, "codes must be distinct");
  assert.ok(new DomainDiscoveryDisabledError() instanceof DomainDiscoveryDisabledError);
  assert.ok(!(new DomainDiscoveryDisabledError() instanceof DomainDiscoveryBusyError));

  const expected: DomainDiscoveryErrorCode[] = [
    "COMPANY_DOMAIN_DISCOVERY_DISABLED",
    "COMPANY_DOMAIN_DISCOVERY_RATE_LIMITED",
    "COMPANY_DOMAIN_DISCOVERY_BUSY",
    "COMPANY_DOMAIN_DISCOVERY_TIMEOUT",
    "COMPANY_DOMAIN_DISCOVERY_ERROR",
    "INVALID_DOMAIN_DISCOVERY_RESPONSE",
  ];
  assert.deepEqual(codes, expected);
});

test("domain-discovery errors are NOT part of the public CompanyResearchError family", () => {
  // They must never travel through the public error mapping — proven by not
  // being instances of the public base class.
  for (const err of ALL) {
    assert.ok(!(err instanceof CompanyResearchError), `${err.name} must be internal-only`);
  }
});

test("errors never expose raw provider output, URLs, names or rejected values", () => {
  const rawSecret = "raw openai internal detail https://company.example/secret?token=abc PRZYKŁADOWA";
  const wrapped = new DomainDiscoveryError("OpenAI domain discovery request failed", new Error(rawSecret));
  const invalid = new InvalidDomainDiscoveryResponseError("Domain discovery response was refused");

  for (const err of [wrapped, invalid]) {
    for (const needle of ["company.example", "token=abc", "PRZYKŁADOWA", "http"]) {
      assert.ok(!err.publicMessage.includes(needle), `publicMessage leaked: ${needle}`);
    }
  }
  // The internal message stays generic; the raw cause is held only as `.cause`.
  assert.ok(!wrapped.message.includes("company.example"));
});
