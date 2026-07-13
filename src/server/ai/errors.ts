import "server-only";

export type AIErrorCode =
  | "AI_CONFIG_ERROR"
  | "AI_PROVIDER_ERROR"
  | "AI_INVALID_RESPONSE";

/**
 * Base class for all MarketCompassAI errors. `publicMessage` is safe to
 * surface to a future client; `message` (and `cause`) may contain internal
 * detail and should stay server-side only.
 */
export abstract class AIError extends Error {
  abstract readonly code: AIErrorCode;
  readonly publicMessage: string;
  readonly cause?: unknown;

  constructor(message: string, publicMessage: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    this.publicMessage = publicMessage;
    this.cause = cause;
  }
}

/** Thrown when required AI configuration (env vars) is missing or invalid. */
export class AIConfigError extends AIError {
  readonly code: AIErrorCode = "AI_CONFIG_ERROR";

  constructor(message: string, cause?: unknown) {
    super(message, "MarketCompassAI is not configured correctly.", cause);
  }
}

/** Server-side-only debugging metadata for a provider failure. Never surfaced publicly. */
export interface AIProviderErrorOptions {
  cause?: unknown;
  status?: number;
  requestId?: string;
}

/** Thrown when the OpenAI API call itself fails (network, auth, rate limit, etc). */
export class AIProviderError extends AIError {
  readonly code: AIErrorCode = "AI_PROVIDER_ERROR";
  /** HTTP status from the provider response, when available (server-side only). */
  readonly status: number | undefined;
  /** Provider request ID for debugging, when available (server-side only). */
  readonly requestId: string | undefined;

  constructor(message: string, options: AIProviderErrorOptions = {}) {
    super(message, "MarketCompassAI is temporarily unavailable. Please try again.", options.cause);
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

/** Thrown when the model returns an empty or otherwise unusable response. */
export class AIInvalidResponseError extends AIError {
  readonly code: AIErrorCode = "AI_INVALID_RESPONSE";

  constructor(message: string, cause?: unknown) {
    super(message, "MarketCompassAI could not generate a response. Please try again.", cause);
  }
}
