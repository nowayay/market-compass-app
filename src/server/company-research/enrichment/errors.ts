/**
 * INTERNAL typed errors for Company Profile Enrichment.
 *
 * Enrichment is NOT wired into the public Company Research API and its errors
 * never travel through the public error mapping — every caller treats them as
 * "enrichment unavailable" and gracefully falls back to the legal-only profile
 * (see `enrichCompanyProfile.ts`). `message`/`cause` may hold internal detail
 * but must NEVER contain a company name, fact, source URL, raw provider output
 * or any personal data.
 */

export type CompanyEnrichmentErrorCode =
  | "COMPANY_ENRICHMENT_TIMEOUT"
  | "COMPANY_ENRICHMENT_ERROR"
  | "INVALID_COMPANY_ENRICHMENT_RESPONSE"
  | "COMPANY_ENRICHMENT_PRIVACY_VIOLATION";

export abstract class CompanyEnrichmentErrorBase extends Error {
  abstract readonly code: CompanyEnrichmentErrorCode;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.cause = cause;
  }
}

export class CompanyEnrichmentTimeoutError extends CompanyEnrichmentErrorBase {
  readonly code: CompanyEnrichmentErrorCode = "COMPANY_ENRICHMENT_TIMEOUT";
  constructor(message = "Company enrichment provider timed out", cause?: unknown) {
    super(message, cause);
  }
}

export class CompanyEnrichmentError extends CompanyEnrichmentErrorBase {
  readonly code: CompanyEnrichmentErrorCode = "COMPANY_ENRICHMENT_ERROR";
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

export class InvalidCompanyEnrichmentResponseError extends CompanyEnrichmentErrorBase {
  readonly code: CompanyEnrichmentErrorCode = "INVALID_COMPANY_ENRICHMENT_RESPONSE";
  constructor(message = "Invalid company enrichment response", cause?: unknown) {
    super(message, cause);
  }
}

/** A personal-data violation anywhere in the structured provider output. */
export class CompanyEnrichmentPrivacyError extends CompanyEnrichmentErrorBase {
  readonly code: CompanyEnrichmentErrorCode = "COMPANY_ENRICHMENT_PRIVACY_VIOLATION";
  constructor(message = "Company enrichment output failed the personal-data guard", cause?: unknown) {
    super(message, cause);
  }
}
