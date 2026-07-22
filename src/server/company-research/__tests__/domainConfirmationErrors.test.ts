import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DomainConfirmationBusyError,
  DomainConfirmationDisabledError,
  DomainConfirmationError,
  DomainConfirmationErrorBase,
  DomainConfirmationRateLimitedError,
  DomainConfirmationTimeoutError,
  InvalidDomainConfirmationResponseError,
} from "../domain-confirmation/errors.ts";
import { CompanyResearchError } from "../errors.ts";
import type { DomainConfirmationErrorCode } from "../domain-confirmation/errors.ts";
import type { CompanyResearchErrorCode } from "../../../contracts/companyResearch.ts";

// (38/39) Compile-time guard: a confirmation code must NOT be assignable to the
// public union. `@ts-expect-error` REQUIRES this to be a type error; if a
// confirmation code were ever added to the public union the directive would
// become unused and `npm run test:typecheck` would fail.
// @ts-expect-error domain-confirmation codes are intentionally not part of the public union.
const _publicUnionExcludesConfirmationCode: CompanyResearchErrorCode = "COMPANY_DOMAIN_CONFIRMATION_DISABLED";
void _publicUnionExcludesConfirmationCode;

const ALL = [
  new DomainConfirmationDisabledError(),
  new DomainConfirmationRateLimitedError(),
  new DomainConfirmationBusyError(),
  new DomainConfirmationTimeoutError(),
  new DomainConfirmationError("provider failed"),
  new InvalidDomainConfirmationResponseError(),
];

test("confirmation errors are typed and internally distinguishable", () => {
  for (const err of ALL) {
    assert.ok(err instanceof DomainConfirmationErrorBase);
    assert.equal(typeof err.code, "string");
    assert.equal(typeof err.publicMessage, "string");
  }
  const codes = ALL.map((e) => e.code);
  assert.equal(new Set(codes).size, ALL.length, "codes must be distinct");

  const expected: DomainConfirmationErrorCode[] = [
    "COMPANY_DOMAIN_CONFIRMATION_DISABLED",
    "COMPANY_DOMAIN_CONFIRMATION_RATE_LIMITED",
    "COMPANY_DOMAIN_CONFIRMATION_BUSY",
    "COMPANY_DOMAIN_CONFIRMATION_TIMEOUT",
    "COMPANY_DOMAIN_CONFIRMATION_ERROR",
    "INVALID_DOMAIN_CONFIRMATION_RESPONSE",
  ];
  assert.deepEqual(codes, expected);
});

// (38) codes remain internal — never part of the public CompanyResearchError family
test("confirmation errors are NOT part of the public CompanyResearchError family", () => {
  for (const err of ALL) {
    assert.ok(!(err instanceof CompanyResearchError), `${err.name} must be internal-only`);
  }
});

test("errors never expose raw provider output, URLs, names or rejected values", () => {
  const rawSecret = "raw openai internal detail https://company.example/secret?token=abc PRZYKŁADOWA";
  const wrapped = new DomainConfirmationError("OpenAI domain confirmation request failed", new Error(rawSecret));
  const invalid = new InvalidDomainConfirmationResponseError("Domain confirmation response was refused");

  for (const err of [wrapped, invalid]) {
    for (const needle of ["company.example", "token=abc", "PRZYKŁADOWA", "http"]) {
      assert.ok(!err.publicMessage.includes(needle), `publicMessage leaked: ${needle}`);
    }
  }
  assert.ok(!wrapped.message.includes("company.example"));
});
