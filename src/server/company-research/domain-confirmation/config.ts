import "server-only";
import { z } from "zod";
import { CompanyResearchConfigurationError } from "../errors";

/**
 * Dedicated configuration for evidence-backed official-domain confirmation. It
 * does NOT reuse the discovery or identification config values — confirmation is
 * a separate paid flow with its own feature flag, timeout, token/tool caps and
 * budget. All values have defaults, so NO new environment variable is required
 * while the feature is disabled.
 */

const DEFAULT_ENABLED = false;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_TOOL_CALLS = 2;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;
const DEFAULT_MAX_PER_WINDOW = 10;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_CONCURRENT = 1;

const envSchema = z.object({
  // Domain confirmation (paid web search) is OFF unless explicitly enabled.
  COMPANY_DOMAIN_CONFIRMATION_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? DEFAULT_ENABLED : v === "true")),
  COMPANY_DOMAIN_CONFIRMATION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120000)
    .default(DEFAULT_TIMEOUT_MS),
  COMPANY_DOMAIN_CONFIRMATION_MAX_TOOL_CALLS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(DEFAULT_MAX_TOOL_CALLS),
  COMPANY_DOMAIN_CONFIRMATION_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(256)
    .max(8000)
    .default(DEFAULT_MAX_OUTPUT_TOKENS),
  COMPANY_DOMAIN_CONFIRMATION_MAX_REQUESTS_PER_WINDOW: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_MAX_PER_WINDOW),
  COMPANY_DOMAIN_CONFIRMATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(DEFAULT_WINDOW_MS),
  COMPANY_DOMAIN_CONFIRMATION_MAX_CONCURRENT: z.coerce
    .number()
    .int()
    .min(1)
    .default(DEFAULT_MAX_CONCURRENT),
});

export interface DomainConfirmationConfig {
  enabled: boolean;
  timeoutMs: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  maxPerWindow: number;
  windowMs: number;
  maxConcurrent: number;
}

let cached: DomainConfirmationConfig | null = null;

export function getDomainConfirmationConfig(): DomainConfirmationConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    COMPANY_DOMAIN_CONFIRMATION_ENABLED: process.env.COMPANY_DOMAIN_CONFIRMATION_ENABLED,
    COMPANY_DOMAIN_CONFIRMATION_TIMEOUT_MS: process.env.COMPANY_DOMAIN_CONFIRMATION_TIMEOUT_MS,
    COMPANY_DOMAIN_CONFIRMATION_MAX_TOOL_CALLS:
      process.env.COMPANY_DOMAIN_CONFIRMATION_MAX_TOOL_CALLS,
    COMPANY_DOMAIN_CONFIRMATION_MAX_OUTPUT_TOKENS:
      process.env.COMPANY_DOMAIN_CONFIRMATION_MAX_OUTPUT_TOKENS,
    COMPANY_DOMAIN_CONFIRMATION_MAX_REQUESTS_PER_WINDOW:
      process.env.COMPANY_DOMAIN_CONFIRMATION_MAX_REQUESTS_PER_WINDOW,
    COMPANY_DOMAIN_CONFIRMATION_WINDOW_MS: process.env.COMPANY_DOMAIN_CONFIRMATION_WINDOW_MS,
    COMPANY_DOMAIN_CONFIRMATION_MAX_CONCURRENT:
      process.env.COMPANY_DOMAIN_CONFIRMATION_MAX_CONCURRENT,
  });

  if (!parsed.success) {
    throw new CompanyResearchConfigurationError(
      `Invalid domain-confirmation configuration: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  }

  cached = {
    enabled: parsed.data.COMPANY_DOMAIN_CONFIRMATION_ENABLED,
    timeoutMs: parsed.data.COMPANY_DOMAIN_CONFIRMATION_TIMEOUT_MS,
    maxToolCalls: parsed.data.COMPANY_DOMAIN_CONFIRMATION_MAX_TOOL_CALLS,
    maxOutputTokens: parsed.data.COMPANY_DOMAIN_CONFIRMATION_MAX_OUTPUT_TOKENS,
    maxPerWindow: parsed.data.COMPANY_DOMAIN_CONFIRMATION_MAX_REQUESTS_PER_WINDOW,
    windowMs: parsed.data.COMPANY_DOMAIN_CONFIRMATION_WINDOW_MS,
    maxConcurrent: parsed.data.COMPANY_DOMAIN_CONFIRMATION_MAX_CONCURRENT,
  };
  return cached;
}
