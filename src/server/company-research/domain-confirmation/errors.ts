/**
 * INTERNAL typed errors for evidence-backed official-domain confirmation.
 *
 * Confirmation is NOT wired into the public Company Research API in this commit,
 * so its error codes are deliberately kept OUT of the public
 * `CompanyResearchErrorCode` union. They live here, in the server module, as
 * `DomainConfirmationErrorCode`, and these classes do NOT extend the public
 * `CompanyResearchError` base — so a confirmation error can never accidentally
 * travel through the public error mapping. A deliberate public mapping (if ever
 * needed) will be designed when the flow is wired into `researchCompany()`.
 *
 * `publicMessage` is a generic, safe message; `message`/`cause` may hold internal
 * detail but must NEVER contain a company name, URL, raw provider output, source
 * metadata or any rejected value.
 *
 * No `server-only` import: the module lives in the server tree but stays loadable
 * by the Node test runner (mirroring ../domain-discovery/errors.ts).
 */

/** Stable INTERNAL error codes for confirmation (not a public contract). */
export type DomainConfirmationErrorCode =
  | "COMPANY_DOMAIN_CONFIRMATION_DISABLED"
  | "COMPANY_DOMAIN_CONFIRMATION_RATE_LIMITED"
  | "COMPANY_DOMAIN_CONFIRMATION_BUSY"
  | "COMPANY_DOMAIN_CONFIRMATION_TIMEOUT"
  | "COMPANY_DOMAIN_CONFIRMATION_ERROR"
  | "INVALID_DOMAIN_CONFIRMATION_RESPONSE";

/** Internal base for all confirmation errors. NOT a `CompanyResearchError`. */
export abstract class DomainConfirmationErrorBase extends Error {
  abstract readonly code: DomainConfirmationErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, publicMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

/** Domain confirmation (paid web search) is disabled by configuration. */
export class DomainConfirmationDisabledError extends DomainConfirmationErrorBase {
  readonly code: DomainConfirmationErrorCode = "COMPANY_DOMAIN_CONFIRMATION_DISABLED";
  constructor(message = "Domain confirmation is disabled") {
    super(message, "Potwierdzanie domeny firmy jest obecnie wyłączone.");
  }
}

/** The per-process confirmation window budget has been exhausted. */
export class DomainConfirmationRateLimitedError extends DomainConfirmationErrorBase {
  readonly code: DomainConfirmationErrorCode = "COMPANY_DOMAIN_CONFIRMATION_RATE_LIMITED";
  constructor(message = "Domain confirmation rate limit exceeded") {
    super(message, "Zbyt wiele prób potwierdzenia domeny. Spróbuj ponownie za chwilę.");
  }
}

/** Too many concurrent domain confirmations in progress. */
export class DomainConfirmationBusyError extends DomainConfirmationErrorBase {
  readonly code: DomainConfirmationErrorCode = "COMPANY_DOMAIN_CONFIRMATION_BUSY";
  constructor(message = "Too many concurrent domain confirmations") {
    super(message, "Usługa potwierdzania domeny jest chwilowo zajęta. Spróbuj ponownie.");
  }
}

/** The confirmation provider timed out. */
export class DomainConfirmationTimeoutError extends DomainConfirmationErrorBase {
  readonly code: DomainConfirmationErrorCode = "COMPANY_DOMAIN_CONFIRMATION_TIMEOUT";
  constructor(message = "Domain confirmation provider timed out", cause?: unknown) {
    super(message, "Przekroczono czas potwierdzania domeny. Spróbuj ponownie.", cause);
  }
}

/** The confirmation provider (OpenAI web search) failed. */
export class DomainConfirmationError extends DomainConfirmationErrorBase {
  readonly code: DomainConfirmationErrorCode = "COMPANY_DOMAIN_CONFIRMATION_ERROR";
  constructor(message: string, cause?: unknown) {
    super(message, "Potwierdzanie domeny firmy jest chwilowo niedostępne. Spróbuj ponownie.", cause);
  }
}

/** The confirmation provider returned output that failed runtime validation. */
export class InvalidDomainConfirmationResponseError extends DomainConfirmationErrorBase {
  readonly code: DomainConfirmationErrorCode = "INVALID_DOMAIN_CONFIRMATION_RESPONSE";
  constructor(message = "Invalid domain confirmation response", cause?: unknown) {
    super(message, "Nie udało się potwierdzić domeny firmy. Spróbuj ponownie.", cause);
  }
}
