import "server-only";
import type OpenAI from "openai";

/** Token usage for a single Responses API call, straight from the SDK. */
export type AIUsage = OpenAI.Responses.ResponseUsage;

export interface GenerateResponseInput {
  /** The user-provided input text sent to the model. */
  input: string;
  /**
   * Optional, trusted, server-authored task-specific instructions that are
   * appended after (never replace) the MarketCompass base instructions.
   *
   * This field must only ever contain instructions composed by our own
   * server-side code. Raw user input must never be placed here — the user's
   * message belongs in `input` only.
   */
  additionalInstructions?: string;
}

export interface GenerateResponseResult {
  /** The model's generated text (from `response.output_text`). */
  text: string;
  /** OpenAI Response object ID. */
  responseId: string;
  /** X-Request-ID header from the OpenAI HTTP response, when available. */
  requestId: string | null;
  /** Model that actually produced the response. */
  model: string;
  /** Token usage, when reported by the API. */
  usage: AIUsage | null;
}
