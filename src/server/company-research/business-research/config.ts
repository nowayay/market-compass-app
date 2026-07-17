import "server-only";
import { z } from "zod";
import { CompanyResearchConfigurationError } from "../errors";

/**
 * Dedicated configuration for Structured Business Research. It does NOT reuse the
 * discovery / confirmation / identification config values — business research is
 * a separate paid flow with its own feature flag, timeout, token/tool caps and
 * budget. All values have defaults, so NO new environment variable is required
 * while the feature is disabled.
 */

const DEFAULT_ENABLED = false;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_TOOL_CALLS = 3;
const DEFAULT_MAX_OUTPUT_TOKENS = 1800;
const DEFAULT_MAX_PER_WINDOW = 10;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX_CONCURRENT = 1;

const envSchema = z.object({
  COMPANY_BUSINESS_RESEARCH_ENABLED: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? DEFAULT_ENABLED : v === "true")),
  COMPANY_BUSINESS_RESEARCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(DEFAULT_TIMEOUT_MS),
  COMPANY_BUSINESS_RESEARCH_MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(10).default(DEFAULT_MAX_TOOL_CALLS),
  COMPANY_BUSINESS_RESEARCH_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8000).default(DEFAULT_MAX_OUTPUT_TOKENS),
  COMPANY_BUSINESS_RESEARCH_MAX_REQUESTS_PER_WINDOW: z.coerce.number().int().min(1).default(DEFAULT_MAX_PER_WINDOW),
  COMPANY_BUSINESS_RESEARCH_WINDOW_MS: z.coerce.number().int().min(1000).default(DEFAULT_WINDOW_MS),
  COMPANY_BUSINESS_RESEARCH_MAX_CONCURRENT: z.coerce.number().int().min(1).default(DEFAULT_MAX_CONCURRENT),
});

export interface BusinessResearchConfig {
  enabled: boolean;
  timeoutMs: number;
  maxToolCalls: number;
  maxOutputTokens: number;
  maxPerWindow: number;
  windowMs: number;
  maxConcurrent: number;
}

let cached: BusinessResearchConfig | null = null;

export function getBusinessResearchConfig(): BusinessResearchConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    COMPANY_BUSINESS_RESEARCH_ENABLED: process.env.COMPANY_BUSINESS_RESEARCH_ENABLED,
    COMPANY_BUSINESS_RESEARCH_TIMEOUT_MS: process.env.COMPANY_BUSINESS_RESEARCH_TIMEOUT_MS,
    COMPANY_BUSINESS_RESEARCH_MAX_TOOL_CALLS: process.env.COMPANY_BUSINESS_RESEARCH_MAX_TOOL_CALLS,
    COMPANY_BUSINESS_RESEARCH_MAX_OUTPUT_TOKENS: process.env.COMPANY_BUSINESS_RESEARCH_MAX_OUTPUT_TOKENS,
    COMPANY_BUSINESS_RESEARCH_MAX_REQUESTS_PER_WINDOW: process.env.COMPANY_BUSINESS_RESEARCH_MAX_REQUESTS_PER_WINDOW,
    COMPANY_BUSINESS_RESEARCH_WINDOW_MS: process.env.COMPANY_BUSINESS_RESEARCH_WINDOW_MS,
    COMPANY_BUSINESS_RESEARCH_MAX_CONCURRENT: process.env.COMPANY_BUSINESS_RESEARCH_MAX_CONCURRENT,
  });

  if (!parsed.success) {
    throw new CompanyResearchConfigurationError(
      `Invalid business-research configuration: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  cached = {
    enabled: parsed.data.COMPANY_BUSINESS_RESEARCH_ENABLED,
    timeoutMs: parsed.data.COMPANY_BUSINESS_RESEARCH_TIMEOUT_MS,
    maxToolCalls: parsed.data.COMPANY_BUSINESS_RESEARCH_MAX_TOOL_CALLS,
    maxOutputTokens: parsed.data.COMPANY_BUSINESS_RESEARCH_MAX_OUTPUT_TOKENS,
    maxPerWindow: parsed.data.COMPANY_BUSINESS_RESEARCH_MAX_REQUESTS_PER_WINDOW,
    windowMs: parsed.data.COMPANY_BUSINESS_RESEARCH_WINDOW_MS,
    maxConcurrent: parsed.data.COMPANY_BUSINESS_RESEARCH_MAX_CONCURRENT,
  };
  return cached;
}
