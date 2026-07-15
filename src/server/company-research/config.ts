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

const envSchema = z.object({
  KRS_API_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(DEFAULT_TIMEOUT_MS),
});

export interface CompanyResearchConfig {
  timeoutMs: number;
}

let cached: CompanyResearchConfig | null = null;

export function getCompanyResearchConfig(): CompanyResearchConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    KRS_API_TIMEOUT_MS: process.env.KRS_API_TIMEOUT_MS,
  });

  if (!parsed.success) {
    throw new CompanyResearchConfigurationError(
      `Invalid company-research configuration: ${parsed.error.issues
        .map((i) => i.message)
        .join(", ")}`,
    );
  }

  cached = { timeoutMs: parsed.data.KRS_API_TIMEOUT_MS };
  return cached;
}
