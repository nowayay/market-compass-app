import "server-only";
import { z } from "zod";
import { AIConfigError } from "./errors";

const DEFAULT_MODEL = "gpt-5.5";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY must be a non-empty string"),
  OPENAI_MODEL: z.string().trim().min(1).default(DEFAULT_MODEL),
});

export interface AIConfig {
  apiKey: string;
  model: string;
}

let cachedConfig: AIConfig | null = null;

function readAIConfig(): AIConfig {
  const parsed = envSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });

  if (!parsed.success) {
    throw new AIConfigError(
      `Invalid AI environment configuration: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
    );
  }

  return {
    apiKey: parsed.data.OPENAI_API_KEY,
    model: parsed.data.OPENAI_MODEL,
  };
}

/**
 * Validates and returns the AI environment configuration.
 * Validation is deferred to first call (not module import) and cached
 * afterwards, so importing this module never throws or reads env vars
 * as a side effect.
 */
export function getAIConfig(): AIConfig {
  if (!cachedConfig) {
    cachedConfig = readAIConfig();
  }
  return cachedConfig;
}
