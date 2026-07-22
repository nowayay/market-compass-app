import { countryDetailsSchema } from "@/src/contracts/countryDetails";
import type { CountryDetails } from "@/src/contracts/countryDetails";

/**
 * Thin browser client for POST /api/company-research/country-details.
 *
 * Transport only — no business logic. It sends the company + country context,
 * parses the JSON response, validates it against the shared contract (the
 * server is never trusted blindly), and throws a typed, safe error on failure.
 * Browser-safe: imports only shared contract types, never server code.
 */

export interface CountryDetailsRequestInput {
  company: {
    legalName: string;
    industry?: string;
    description?: string;
    productsServices: string[];
    customerSegments: string[];
    operatingMarkets: string[];
  };
  country: {
    countryCode: string;
    countryName: string;
    score: number;
  };
}

const GENERIC_MESSAGE = "Nie udało się wygenerować szczegółów dla tego kraju. Spróbuj ponownie.";

/** A safe, typed client error carrying only a display message. */
export class CountryDetailsClientError extends Error {
  constructor(message: string = GENERIC_MESSAGE) {
    super(message);
    this.name = "CountryDetailsClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function fetchCountryDetails(
  input: CountryDetailsRequestInput,
  signal?: AbortSignal,
): Promise<CountryDetails> {
  let response: Response;
  try {
    response = await fetch("/api/company-research/country-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (isRecord(error) && error.name === "AbortError") throw error;
    throw new CountryDetailsClientError();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CountryDetailsClientError();
  }

  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
        ? payload.error.message
        : GENERIC_MESSAGE;
    throw new CountryDetailsClientError(message);
  }

  const details = isRecord(payload) ? payload.details : undefined;
  const validated = countryDetailsSchema.safeParse(details);
  if (!validated.success) {
    throw new CountryDetailsClientError();
  }
  return validated.data;
}
