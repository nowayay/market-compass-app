/**
 * INTERNAL typed errors for Structured Business Research.
 *
 * Business research is NOT wired into the public Company Research API, so its
 * error codes are deliberately kept OUT of the public `CompanyResearchErrorCode`
 * union and do NOT extend the public `CompanyResearchError` base — a
 * business-research error can never travel through the public error mapping.
 *
 * `publicMessage` is a generic, safe message; `message`/`cause` may hold internal
 * detail but must NEVER contain a company name, domain, fact, source URL, raw
 * provider output, rejected value or any personal data.
 *
 * No `server-only` import: the module lives in the server tree but stays loadable
 * by the Node test runner (mirroring the sibling module error files).
 */

/** Stable INTERNAL error codes for business research (not a public contract). */
export type BusinessResearchErrorCode =
  | "COMPANY_BUSINESS_RESEARCH_DISABLED"
  | "COMPANY_BUSINESS_RESEARCH_RATE_LIMITED"
  | "COMPANY_BUSINESS_RESEARCH_BUSY"
  | "COMPANY_BUSINESS_RESEARCH_TIMEOUT"
  | "COMPANY_BUSINESS_RESEARCH_ERROR"
  | "INVALID_BUSINESS_RESEARCH_RESPONSE"
  | "COMPANY_BUSINESS_RESEARCH_PRIVACY_VIOLATION"
  | "COMPANY_BUSINESS_RESEARCH_INVARIANT";

/** Internal base for all business-research errors. NOT a `CompanyResearchError`. */
export abstract class BusinessResearchErrorBase extends Error {
  abstract readonly code: BusinessResearchErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, publicMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

export class BusinessResearchDisabledError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_DISABLED";
  constructor(message = "Business research is disabled") {
    super(message, "Analiza działalności firmy jest obecnie wyłączona.");
  }
}

export class BusinessResearchRateLimitedError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_RATE_LIMITED";
  constructor(message = "Business research rate limit exceeded") {
    super(message, "Zbyt wiele prób analizy działalności. Spróbuj ponownie za chwilę.");
  }
}

export class BusinessResearchBusyError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_BUSY";
  constructor(message = "Too many concurrent business researches") {
    super(message, "Usługa analizy działalności jest chwilowo zajęta. Spróbuj ponownie.");
  }
}

export class BusinessResearchTimeoutError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_TIMEOUT";
  constructor(message = "Business research provider timed out", cause?: unknown) {
    super(message, "Przekroczono czas analizy działalności. Spróbuj ponownie.", cause);
  }
}

export class BusinessResearchError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_ERROR";
  constructor(message: string, cause?: unknown) {
    super(message, "Analiza działalności firmy jest chwilowo niedostępna. Spróbuj ponownie.", cause);
  }
}

export class InvalidBusinessResearchResponseError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "INVALID_BUSINESS_RESEARCH_RESPONSE";
  constructor(message = "Invalid business research response", cause?: unknown) {
    super(message, "Nie udało się przeprowadzić analizy działalności. Spróbuj ponownie.", cause);
  }
}

/** A personal-data violation anywhere in the structured provider output. */
export class BusinessResearchPrivacyError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_PRIVACY_VIOLATION";
  constructor(message = "Business research output failed the personal-data guard", cause?: unknown) {
    super(message, "Analiza działalności została przerwana ze względów prywatności.", cause);
  }
}

/** A broken internal invariant (impossible confirmed-resolution state). */
export class BusinessResearchInvariantError extends BusinessResearchErrorBase {
  readonly code: BusinessResearchErrorCode = "COMPANY_BUSINESS_RESEARCH_INVARIANT";
  constructor(message: string) {
    super(`Business research invariant violated: ${message}`, "Wystąpił wewnętrzny błąd analizy działalności.");
  }
}
