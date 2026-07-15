import type {
  CompanyResearchErrorCode,
  CompanyResearchResponse,
} from "@/src/contracts/companyResearch";
import { companyResearchResponseSchema } from "@/src/contracts/companyResearchSchema";

/**
 * Thin browser client for POST /api/company-research.
 *
 * Transport only — no business logic and no KRS/data mapping. It sends the
 * request, parses the JSON response, and throws a typed, safe error on failure.
 * It is browser-safe: it imports only shared contract types (no server code).
 */

export interface CompanyResearchQueryInput {
  name: string;
  countryCode?: string;
  foundedYear?: number;
  krs?: string;
}

export interface CompanyResearchRequestInput {
  query: CompanyResearchQueryInput;
  selectedCandidateId?: string | null;
}

const GENERIC_MESSAGE = "Nie udało się wykonać researchu firmy. Spróbuj ponownie.";

type ClientErrorCode = CompanyResearchErrorCode | "CLIENT_ERROR" | "INVALID_SERVER_RESPONSE";

/** A safe, typed client error. Carries only a display message and stable code. */
export class CompanyResearchClientError extends Error {
  readonly code: ClientErrorCode;
  readonly requestId?: string;

  constructor(
    message: string,
    code: ClientErrorCode = "CLIENT_ERROR",
    requestId?: string,
  ) {
    super(message);
    this.name = "CompanyResearchClientError";
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function researchCompany(
  input: CompanyResearchRequestInput,
  signal?: AbortSignal,
): Promise<CompanyResearchResponse> {
  let response: Response;
  try {
    response = await fetch("/api/company-research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    // Let user-initiated aborts propagate untouched.
    if (isRecord(error) && error.name === "AbortError") throw error;
    throw new CompanyResearchClientError(GENERIC_MESSAGE);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CompanyResearchClientError(GENERIC_MESSAGE);
  }

  if (!response.ok) {
    // Error envelope: { error: { code, message }, requestId }
    if (isRecord(payload) && isRecord(payload.error)) {
      const code =
        typeof payload.error.code === "string"
          ? (payload.error.code as CompanyResearchErrorCode)
          : "CLIENT_ERROR";
      const message =
        typeof payload.error.message === "string" && payload.error.message.length > 0
          ? payload.error.message
          : GENERIC_MESSAGE;
      const requestId = typeof payload.requestId === "string" ? payload.requestId : undefined;
      throw new CompanyResearchClientError(message, code, requestId);
    }
    throw new CompanyResearchClientError(GENERIC_MESSAGE);
  }

  // Success: validate the payload against the shared contract schema instead of
  // trusting the server. Never surface or log the raw payload on mismatch.
  const validated = companyResearchResponseSchema.safeParse(payload);
  if (!validated.success) {
    throw new CompanyResearchClientError(GENERIC_MESSAGE, "INVALID_SERVER_RESPONSE");
  }
  return validated.data as CompanyResearchResponse;
}
