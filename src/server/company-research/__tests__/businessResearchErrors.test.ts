import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BusinessResearchBusyError,
  BusinessResearchDisabledError,
  BusinessResearchError,
  BusinessResearchErrorBase,
  BusinessResearchInvariantError,
  BusinessResearchPrivacyError,
  BusinessResearchRateLimitedError,
  BusinessResearchTimeoutError,
  InvalidBusinessResearchResponseError,
} from "../business-research/errors.ts";
import { CompanyResearchError } from "../errors.ts";
import type { BusinessResearchErrorCode } from "../business-research/errors.ts";
import type { CompanyResearchErrorCode } from "../../../contracts/companyResearch.ts";

// (53) Compile-time guard: a business-research code must NOT be assignable to the
// public union. `@ts-expect-error` REQUIRES this to be a type error.
// @ts-expect-error business-research codes are intentionally not part of the public union.
const _publicUnionExcludes: CompanyResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_DISABLED";
void _publicUnionExcludes;

const ALL = [
  new BusinessResearchDisabledError(),
  new BusinessResearchRateLimitedError(),
  new BusinessResearchBusyError(),
  new BusinessResearchTimeoutError(),
  new BusinessResearchError("provider failed"),
  new InvalidBusinessResearchResponseError(),
  new BusinessResearchPrivacyError(),
  new BusinessResearchInvariantError("bad state"),
];

test("business-research errors are typed and internally distinguishable", () => {
  for (const err of ALL) {
    assert.ok(err instanceof BusinessResearchErrorBase);
    assert.equal(typeof err.code, "string");
    assert.equal(typeof err.publicMessage, "string");
  }
  const codes = ALL.map((e) => e.code);
  assert.equal(new Set(codes).size, ALL.length, "codes must be distinct");

  const expected: BusinessResearchErrorCode[] = [
    "COMPANY_BUSINESS_RESEARCH_DISABLED",
    "COMPANY_BUSINESS_RESEARCH_RATE_LIMITED",
    "COMPANY_BUSINESS_RESEARCH_BUSY",
    "COMPANY_BUSINESS_RESEARCH_TIMEOUT",
    "COMPANY_BUSINESS_RESEARCH_ERROR",
    "INVALID_BUSINESS_RESEARCH_RESPONSE",
    "COMPANY_BUSINESS_RESEARCH_PRIVACY_VIOLATION",
    "COMPANY_BUSINESS_RESEARCH_INVARIANT",
  ];
  assert.deepEqual(codes, expected);
});

test("business-research errors are NOT part of the public CompanyResearchError family", () => {
  for (const err of ALL) {
    assert.ok(!(err instanceof CompanyResearchError), `${err.name} must be internal-only`);
  }
});

test("error public messages never leak raw detail, company names or URLs", () => {
  const wrapped = new BusinessResearchError(
    "OpenAI business research request failed",
    new Error("raw detail https://przyklad.example/secret PRZYKŁADOWA"),
  );
  for (const needle of ["przyklad.example", "secret", "PRZYKŁADOWA", "http"]) {
    assert.ok(!wrapped.publicMessage.includes(needle));
  }
});
