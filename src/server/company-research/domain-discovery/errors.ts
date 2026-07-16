/**
 * INTERNAL typed errors for official domain discovery.
 *
 * Domain discovery is NOT wired into the public Company Research API yet, so its
 * error codes are deliberately kept OUT of the public `CompanyResearchErrorCode`
 * union. They live here, in the server module, as `DomainDiscoveryErrorCode`, and
 * these classes do NOT extend the public `CompanyResearchError` base — so a
 * domain-discovery error can never accidentally travel through the public error
 * mapping. A deliberate public mapping will be designed when the flow is wired
 * into `researchCompany()`.
 *
 * `publicMessage` is a generic, safe message; `message`/`cause` may hold internal
 * detail but must NEVER contain a company name, URL, raw provider output, source
 * metadata or any rejected value.
 *
 * No `server-only` import: the module lives in the server tree but stays loadable
 * by the Node test runner (mirroring ../errors.ts).
 */

/** Stable INTERNAL error codes for domain discovery (not a public contract). */
export type DomainDiscoveryErrorCode =
  | "COMPANY_DOMAIN_DISCOVERY_DISABLED"
  | "COMPANY_DOMAIN_DISCOVERY_RATE_LIMITED"
  | "COMPANY_DOMAIN_DISCOVERY_BUSY"
  | "COMPANY_DOMAIN_DISCOVERY_TIMEOUT"
  | "COMPANY_DOMAIN_DISCOVERY_ERROR"
  | "INVALID_DOMAIN_DISCOVERY_RESPONSE";

/** Internal base for all domain-discovery errors. NOT a `CompanyResearchError`. */
export abstract class DomainDiscoveryErrorBase extends Error {
  abstract readonly code: DomainDiscoveryErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, publicMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

/** Domain discovery (paid web search) is disabled by configuration. */
export class DomainDiscoveryDisabledError extends DomainDiscoveryErrorBase {
  readonly code: DomainDiscoveryErrorCode = "COMPANY_DOMAIN_DISCOVERY_DISABLED";
  constructor(message = "Domain discovery is disabled") {
    super(message, "Wyszukiwanie domeny firmy jest obecnie wyłączone.");
  }
}

/** The per-process domain-discovery window budget has been exhausted. */
export class DomainDiscoveryRateLimitedError extends DomainDiscoveryErrorBase {
  readonly code: DomainDiscoveryErrorCode = "COMPANY_DOMAIN_DISCOVERY_RATE_LIMITED";
  constructor(message = "Domain discovery rate limit exceeded") {
    super(message, "Zbyt wiele prób wyszukania domeny. Spróbuj ponownie za chwilę.");
  }
}

/** Too many concurrent domain discoveries in progress. */
export class DomainDiscoveryBusyError extends DomainDiscoveryErrorBase {
  readonly code: DomainDiscoveryErrorCode = "COMPANY_DOMAIN_DISCOVERY_BUSY";
  constructor(message = "Too many concurrent domain discoveries") {
    super(message, "Usługa wyszukiwania domeny jest chwilowo zajęta. Spróbuj ponownie.");
  }
}

/** The domain-discovery provider timed out. */
export class DomainDiscoveryTimeoutError extends DomainDiscoveryErrorBase {
  readonly code: DomainDiscoveryErrorCode = "COMPANY_DOMAIN_DISCOVERY_TIMEOUT";
  constructor(message = "Domain discovery provider timed out", cause?: unknown) {
    super(message, "Przekroczono czas wyszukiwania domeny. Spróbuj ponownie.", cause);
  }
}

/** The domain-discovery provider (OpenAI web search) failed. */
export class DomainDiscoveryError extends DomainDiscoveryErrorBase {
  readonly code: DomainDiscoveryErrorCode = "COMPANY_DOMAIN_DISCOVERY_ERROR";
  constructor(message: string, cause?: unknown) {
    super(message, "Wyszukiwanie domeny firmy jest chwilowo niedostępne. Spróbuj ponownie.", cause);
  }
}

/** The domain-discovery provider returned output that failed runtime validation. */
export class InvalidDomainDiscoveryResponseError extends DomainDiscoveryErrorBase {
  readonly code: DomainDiscoveryErrorCode = "INVALID_DOMAIN_DISCOVERY_RESPONSE";
  constructor(message = "Invalid domain discovery response", cause?: unknown) {
    super(message, "Nie udało się wyszukać domeny firmy. Spróbuj ponownie.", cause);
  }
}
