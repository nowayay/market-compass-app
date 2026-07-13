import "server-only";
import { APIError } from "openai";
import { getOpenAIClient } from "../client";
import { getAIConfig } from "../config";
import { AIInvalidResponseError, AIProviderError } from "../errors";
import { MARKET_COMPASS_INSTRUCTIONS } from "../prompts/marketCompass";
import type { GenerateResponseInput, GenerateResponseResult } from "../types";

/**
 * Builds the instruction string for a request: always the MarketCompass base
 * instructions, optionally followed by trusted, server-authored task-specific
 * instructions. Additional instructions can only extend the base prompt, never
 * replace it.
 */
function buildInstructions(additionalInstructions?: string): string {
  const extra = additionalInstructions?.trim();
  if (!extra) {
    return MARKET_COMPASS_INSTRUCTIONS;
  }
  return `${MARKET_COMPASS_INSTRUCTIONS}\n\n---\n\n${extra}`;
}

/**
 * Calls the OpenAI Responses API with the MarketCompass base instructions
 * (optionally extended by trusted task-specific instructions) and returns a
 * typed result. Never uses Chat Completions or the Assistants API.
 */
export async function generateResponse(
  input: GenerateResponseInput,
): Promise<GenerateResponseResult> {
  const config = getAIConfig();
  const client = getOpenAIClient();

  let data;
  let requestId: string | null;

  try {
    const result = await client.responses
      .create({
        model: config.model,
        instructions: buildInstructions(input.additionalInstructions),
        input: input.input,
      })
      .withResponse();
    data = result.data;
    requestId = result.request_id;
  } catch (cause) {
    if (cause instanceof APIError) {
      throw new AIProviderError(
        `OpenAI Responses API request failed with status ${cause.status ?? "unknown"}`,
        {
          cause,
          status: cause.status,
          requestId: cause.requestID ?? undefined,
        },
      );
    }
    throw new AIProviderError("OpenAI Responses API request failed", { cause });
  }

  const text = data.output_text?.trim();
  if (!text) {
    throw new AIInvalidResponseError(
      `OpenAI response ${data.id} contained no usable output_text`,
    );
  }

  return {
    text,
    responseId: data.id,
    requestId,
    model: data.model,
    usage: data.usage ?? null,
  };
}
