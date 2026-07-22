import { countryDetailsRequestSchema } from "./requestSchema.ts";
import {
  CountryDetailsError,
  CountryDetailsTimeoutError,
  InvalidCountryDetailsResponseError,
} from "./errors.ts";
import type { CountryDetailsProvider } from "./types.ts";

/**
 * Core HTTP logic for POST /api/company-research/country-details. The provider
 * is injected so this handler is fully unit-testable with a fake provider and
 * no network / `server-only` dependency. The Next route is a thin wrapper that
 * supplies the production OpenAI-backed provider.
 */

export interface CountryDetailsHandlerDeps {
  provider: CountryDetailsProvider;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { error: { code, message } });
}

const GENERIC = "Nie udało się wygenerować szczegółów dla tego kraju. Spróbuj ponownie.";

export async function handleCountryDetails(
  request: Request,
  deps: CountryDetailsHandlerDeps,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Nieprawidłowy format żądania.");
  }

  const parsed = countryDetailsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_REQUEST", "Nieprawidłowe zapytanie.");
  }

  try {
    const details = await deps.provider.generate(parsed.data, { signal: request.signal });
    return jsonResponse(200, { details });
  } catch (error) {
    const isAbort =
      request.signal.aborted ||
      (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError");
    if (isAbort) {
      return new Response(null, { status: 499 });
    }

    if (error instanceof CountryDetailsTimeoutError) {
      return errorResponse(504, error.code, error.publicMessage);
    }
    if (error instanceof InvalidCountryDetailsResponseError) {
      return errorResponse(502, error.code, error.publicMessage);
    }
    if (error instanceof CountryDetailsError) {
      return errorResponse(503, error.code, error.publicMessage);
    }
    return errorResponse(500, "COUNTRY_DETAILS_INTERNAL_ERROR", GENERIC);
  }
}
