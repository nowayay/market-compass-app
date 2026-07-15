import type { CompanyResearchErrorCode } from "../../contracts/companyResearch";

/**
 * Base class for Company Research technical errors. `publicMessage` is safe to
 * return to a client; `message` and `cause` may hold internal detail and must
 * stay server-side only. Never place raw KRS responses, request bodies or
 * personal data in either field.
 *
 * This module has no local runtime imports (only a type import, erased at
 * runtime), so it stays loadable by the Node test runner without a bundler.
 */
export abstract class CompanyResearchError extends Error {
  abstract readonly code: CompanyResearchErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, publicMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

/** Provided KRS number could not be normalized to exactly 10 digits. */
export class InvalidKrsError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "INVALID_KRS";
  constructor(message = "Invalid KRS number") {
    super(message, "Nieprawidłowy numer KRS.");
  }
}

/** The request body exceeded the hard byte limit. */
export class RequestBodyTooLargeError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "REQUEST_BODY_TOO_LARGE";
  constructor(message = "Request body too large") {
    super(message, "Żądanie jest zbyt duże.");
  }
}

/** The external data provider (e.g. KRS API) failed. */
export class CompanyResearchProviderError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_RESEARCH_PROVIDER_ERROR";
  /** Upstream HTTP status, when available (server-side only). */
  readonly status: number | undefined;
  constructor(message: string, status?: number, cause?: unknown) {
    super(message, "Zewnętrzne źródło danych jest chwilowo niedostępne. Spróbuj ponownie.", cause);
    this.status = status;
  }
}

/** The external data provider timed out. */
export class CompanyResearchTimeoutError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_RESEARCH_TIMEOUT";
  constructor(message = "Company data provider timed out", cause?: unknown) {
    super(message, "Przekroczono czas oczekiwania na dane. Spróbuj ponownie.", cause);
  }
}

/** Required configuration for the module is missing or invalid. */
export class CompanyResearchConfigurationError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_RESEARCH_CONFIGURATION_ERROR";
  constructor(message: string, cause?: unknown) {
    super(message, "Usługa researchu firm nie jest poprawnie skonfigurowana.", cause);
  }
}

/** Catch-all for unexpected internal failures. */
export class CompanyResearchInternalError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_RESEARCH_INTERNAL_ERROR";
  constructor(message = "Unexpected internal error", cause?: unknown) {
    super(message, "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.", cause);
  }
}

/** The identification provider (OpenAI web search) failed. */
export class CompanyIdentificationError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_IDENTIFICATION_ERROR";
  constructor(message: string, cause?: unknown) {
    super(message, "Identyfikacja firmy jest chwilowo niedostępna. Spróbuj ponownie.", cause);
  }
}

/** The identification provider timed out. */
export class CompanyIdentificationTimeoutError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_IDENTIFICATION_TIMEOUT";
  constructor(message = "Identification provider timed out", cause?: unknown) {
    super(message, "Przekroczono czas identyfikacji firmy. Spróbuj ponownie.", cause);
  }
}

/** The identification provider returned an output that failed runtime validation. */
export class InvalidIdentificationResponseError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "INVALID_IDENTIFICATION_RESPONSE";
  constructor(message = "Invalid identification response", cause?: unknown) {
    super(message, "Nie udało się zidentyfikować firmy. Spróbuj ponownie.", cause);
  }
}

/** The provided candidateId is not a valid, parseable identifier. */
export class InvalidCandidateIdError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "INVALID_CANDIDATE_ID";
  constructor(message = "Invalid candidateId") {
    super(message, "Nieprawidłowy identyfikator kandydata.");
  }
}

/** The selected candidate's KRS number does not resolve to a registry entity. */
export class CandidateNotFoundError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "CANDIDATE_NOT_FOUND";
  constructor(message = "Candidate not found in registry") {
    super(message, "Nie znaleziono wybranego podmiotu w rejestrze.");
  }
}

/** The selected candidate contradicts the query name. */
export class CandidateQueryMismatchError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "CANDIDATE_QUERY_MISMATCH";
  constructor(message = "Selected candidate contradicts the query") {
    super(message, "Wybrany podmiot nie odpowiada podanej nazwie firmy.");
  }
}

/** Name identification (paid web search) is disabled by configuration. */
export class CompanyIdentificationDisabledError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_IDENTIFICATION_DISABLED";
  constructor(message = "Name identification is disabled") {
    super(message, "Identyfikacja firmy po nazwie jest obecnie wyłączona.");
  }
}

/** The per-process identification window budget has been exhausted. */
export class CompanyIdentificationRateLimitedError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_IDENTIFICATION_RATE_LIMITED";
  constructor(message = "Identification rate limit exceeded") {
    super(message, "Zbyt wiele prób identyfikacji. Spróbuj ponownie za chwilę.");
  }
}

/** Too many concurrent identifications in progress. */
export class CompanyIdentificationBusyError extends CompanyResearchError {
  readonly code: CompanyResearchErrorCode = "COMPANY_IDENTIFICATION_BUSY";
  constructor(message = "Too many concurrent identifications") {
    super(message, "Usługa identyfikacji jest chwilowo zajęta. Spróbuj ponownie.");
  }
}

/**
 * Maps a Company Research error code onto an HTTP status. Pure and side-effect
 * free so it can be unit-tested in isolation.
 */
export function errorHttpStatus(code: CompanyResearchErrorCode): number {
  switch (code) {
    case "INVALID_JSON":
    case "INVALID_REQUEST":
    case "INVALID_KRS":
      return 400;
    case "INVALID_CANDIDATE_ID":
      return 400;
    case "REQUEST_BODY_TOO_LARGE":
      return 413;
    case "CANDIDATE_NOT_FOUND":
      return 404;
    case "CANDIDATE_QUERY_MISMATCH":
      return 409;
    case "COMPANY_IDENTIFICATION_RATE_LIMITED":
      return 429;
    case "COMPANY_RESEARCH_PROVIDER_ERROR":
    case "COMPANY_IDENTIFICATION_ERROR":
    case "INVALID_IDENTIFICATION_RESPONSE":
      return 502;
    case "COMPANY_RESEARCH_TIMEOUT":
    case "COMPANY_IDENTIFICATION_TIMEOUT":
    case "COMPANY_IDENTIFICATION_DISABLED":
    case "COMPANY_IDENTIFICATION_BUSY":
      return 503;
    case "COMPANY_RESEARCH_CONFIGURATION_ERROR":
      return 500;
    case "COMPANY_RESEARCH_INTERNAL_ERROR":
      return 500;
    default:
      return 500;
  }
}

/**
 * Refines the HTTP status for a provider failure using its upstream status:
 * 429 rate-limit stays 429; retryable/availability statuses map to 503;
 * everything else is a 502 upstream failure.
 */
export function providerHttpStatus(status: number | undefined): number {
  if (status === 429) return 429;
  if (status === undefined || status === 408 || status === 409 || status >= 500) {
    return 503;
  }
  return 502;
}
