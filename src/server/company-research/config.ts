import "server-only";
import { z } from "zod";
import { CompanyResearchConfigurationError } from "./errors";

/**
 * Configuration for the Company Research providers.
 *
 * The KRS origin is intentionally NOT configurable — production is pinned to the
 * official host in the transport layer, removing any user/env-driven host
 * override (and the associated SSRF risk). Only the request timeout is
 * configurable, and it is not a secret.
 */

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_IDENTIFICATION_TIMEOUT_MS = 30000;
const DEFAULT_IDENTIFICATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_IDENTIFICATION_MAX_PER_WINDOW = 10;
const DEFAULT_IDENTIFICATION_MAX_CONCURRENT = 2;
const DEFAULT_IDENTIFICATION_MAX_OUTPUT_TOKENS = 2000;
const DEFAULT_IDENTIFICATION_MAX_TOOL_CALLS = 3;

const envSchema = z.object({
  KRS_API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(DEFAULT_TIMEOUT_MS),
  COMPANY_IDENTIFICATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(DEFAULT_IDENTIFICATION_TIMEOUT_MS),
  // Name identification (paid web search) is OFF unless explicitly enabled.
  COMPANY_IDENTIFICATION_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  COMPANY_IDENTIFICATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(DEFAULT_IDENTIFICATION_WINDOW_MS),
  COMPANY_IDENTIFICATION_MAX_PER_WINDOW: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_IDENTIFICATION_MAX_PER_WINDOW),
  COMPANY_IDENTIFICATION_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_IDENTIFICATION_MAX_CONCURRENT),
});

export interface CompanyResearchConfig {
  timeoutMs: number;
  identificationTimeoutMs: number;
  identificationEnabled: boolean;
  identificationWindowMs: number;
  identificationMaxPerWindow: number;
  identificationMaxConcurrent: number;
  /** OpenAI cost controls for a small extractive response. */
  identificationMaxOutputTokens: number;
  identificationMaxToolCalls: number;
}

let cached: CompanyResearchConfig | null = null;

export function getCompanyResearchConfig(): CompanyResearchConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    KRS_API_TIMEOUT_MS: process.env.KRS_API_TIMEOUT_MS,
    COMPANY_IDENTIFICATION_TIMEOUT_MS: process.env.COMPANY_IDENTIFICATION_TIMEOUT_MS,
    COMPANY_IDENTIFICATION_ENABLED: process.env.COMPANY_IDENTIFICATION_ENABLED,
    COMPANY_IDENTIFICATION_WINDOW_MS: process.env.COMPANY_IDENTIFICATION_WINDOW_MS,
    COMPANY_IDENTIFICATION_MAX_PER_WINDOW: process.env.COMPANY_IDENTIFICATION_MAX_PER_WINDOW,
    COMPANY_IDENTIFICATION_MAX_CONCURRENT: process.env.COMPANY_IDENTIFICATION_MAX_CONCURRENT,
  });

  if (!parsed.success) {
    throw new CompanyResearchConfigurationError(
      `Invalid company-research configuration: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  }

  cached = {
    timeoutMs: parsed.data.KRS_API_TIMEOUT_MS,
    identificationTimeoutMs: parsed.data.COMPANY_IDENTIFICATION_TIMEOUT_MS,
    identificationEnabled: parsed.data.COMPANY_IDENTIFICATION_ENABLED,
    identificationWindowMs: parsed.data.COMPANY_IDENTIFICATION_WINDOW_MS,
    identificationMaxPerWindow: parsed.data.COMPANY_IDENTIFICATION_MAX_PER_WINDOW,
    identificationMaxConcurrent: parsed.data.COMPANY_IDENTIFICATION_MAX_CONCURRENT,
    identificationMaxOutputTokens: DEFAULT_IDENTIFICATION_MAX_OUTPUT_TOKENS,
    identificationMaxToolCalls: DEFAULT_IDENTIFICATION_MAX_TOOL_CALLS,
  };
  return cached;
}
