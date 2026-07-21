/**
 * Typed errors for the country-details deep-dive. Deliberately NOT
 * `server-only` (the provider core that throws them is unit-tested in Node) and
 * independent of the chat `AIError` hierarchy. Each carries a stable `code` and
 * a safe `publicMessage`; `message`/`cause` may hold internal detail and must
 * stay server-side.
 */

export type CountryDetailsErrorCode =
  | "COUNTRY_DETAILS_TIMEOUT"
  | "COUNTRY_DETAILS_ERROR"
  | "INVALID_COUNTRY_DETAILS_RESPONSE";

const PUBLIC_MESSAGE = "Nie udało się wygenerować szczegółów dla tego kraju. Spróbuj ponownie.";

abstract class CountryDetailsErrorBase extends Error {
  abstract readonly code: CountryDetailsErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = PUBLIC_MESSAGE;
    this.cause = cause;
  }
}

/** The single OpenAI call exceeded the country-details stage timeout. */
export class CountryDetailsTimeoutError extends CountryDetailsErrorBase {
  readonly code: CountryDetailsErrorCode = "COUNTRY_DETAILS_TIMEOUT";
  constructor() {
    super("Country details request timed out");
  }
}

/** A transport / provider failure other than a clean timeout or bad schema. */
export class CountryDetailsError extends CountryDetailsErrorBase {
  readonly code: CountryDetailsErrorCode = "COUNTRY_DETAILS_ERROR";
}

/** The model response failed structural validation (retryable exactly once). */
export class InvalidCountryDetailsResponseError extends CountryDetailsErrorBase {
  readonly code: CountryDetailsErrorCode = "INVALID_COUNTRY_DETAILS_RESPONSE";
}
