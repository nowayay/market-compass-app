import type {
  CompanyResearchErrorCode,
  CompanyResearchErrorResponse,
} from "../../contracts/companyResearch.ts";
import { companyResearchRequestSchema } from "./schema.ts";
import {
  CompanyResearchError,
  CompanyResearchProviderError,
  RequestBodyTooLargeError,
  errorHttpStatus,
  providerHttpStatus,
} from "./errors.ts";
import { readRequestBodyText } from "./http/readRequestBody.ts";
import { researchCompany } from "./researchCompany.ts";
import type { CompanyDataProvider } from "./types.ts";

/** Hard limit on the request body size, in bytes. */
export const MAX_BODY_BYTES = 8 * 1024;

function errorResponse(
  status: number,
  code: CompanyResearchErrorCode,
  message: string,
  requestId: string,
): Response {
  const body: CompanyResearchErrorResponse = { error: { code, message }, requestId };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
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

/** Minimal, privacy-safe technical log line. Never logs request/response data. */
function logResearch(fields: {
  requestId: string;
  status: string;
  durationMs: number;
  provider: string;
  hasKrs: boolean;
  errorCode?: string;
}): void {
  // Only technical metadata — no names, KRS payloads, bodies, or personal data.
  console.info("[company-research]", JSON.stringify(fields));
}

/**
 * Core HTTP logic for POST /api/company-research. The provider is injected so
 * this handler is fully unit-testable with a fake provider and mocked transport,
 * with no network access and no `server-only` dependency. The Next route is a
 * thin wrapper that supplies the production KRS provider.
 */
export async function handleCompanyResearch(
  request: Request,
  provider: CompanyDataProvider,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  // Read the body under a hard byte cap (streaming, not fully buffered first).
  let text: string;
  try {
    text = await readRequestBodyText(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(413, error.code, error.publicMessage, requestId);
    }
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return errorResponse(
      500,
      "COMPANY_RESEARCH_INTERNAL_ERROR",
      "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
      requestId,
    );
  }

  // Parse JSON safely.
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, "INVALID_JSON", "Nieprawidłowy format żądania.", requestId);
  }

  // Validate structure. Never return raw Zod issues.
  const parsed = companyResearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "INVALID_REQUEST", "Nieprawidłowe zapytanie.", requestId);
  }
  const hasKrs = parsed.data.query.krs !== undefined;

  try {
    const result = await researchCompany(parsed.data, provider, {
      requestId,
      signal: request.signal,
    });
    logResearch({
      requestId,
      status: result.status,
      durationMs: Date.now() - startedAt,
      provider: provider.name,
      hasKrs,
    });
    return jsonResponse(200, result);
  } catch (error) {
    // Client cancellation is not a provider outage. Nothing useful can be sent
    // to a disconnected client, and we never surface it as an error.
    const isAbort =
      request.signal.aborted ||
      (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError");
    if (isAbort) {
      return new Response(null, { status: 499 });
    }

    if (error instanceof CompanyResearchError) {
      const status =
        error instanceof CompanyResearchProviderError
          ? providerHttpStatus(error.status)
          : errorHttpStatus(error.code);
      logResearch({
        requestId,
        status: "error",
        durationMs: Date.now() - startedAt,
        provider: provider.name,
        hasKrs,
        errorCode: error.code,
      });
      return errorResponse(status, error.code, error.publicMessage, requestId);
    }

    // Unknown/unexpected failure — never expose internals (incl. a possible
    // personal-data regression caught by the guard, or a caller abort).
    logResearch({
      requestId,
      status: "error",
      durationMs: Date.now() - startedAt,
      provider: provider.name,
      hasKrs,
      errorCode: "COMPANY_RESEARCH_INTERNAL_ERROR",
    });
    return errorResponse(
      500,
      "COMPANY_RESEARCH_INTERNAL_ERROR",
      "Wystąpił nieoczekiwany błąd. Spróbuj ponownie.",
      requestId,
    );
  }
}
