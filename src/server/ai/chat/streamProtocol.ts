import "server-only";
import type { AIErrorCode } from "../errors";

/**
 * The MarketCompass-owned Server-Sent Events protocol. These are the only
 * shapes that ever reach the browser — raw OpenAI stream events, response
 * objects, reasoning content and provider metadata are all translated away
 * before an event of this union is constructed.
 */
export type MarketCompassStreamEvent =
  | TextDeltaEvent
  | CompletedEvent
  | StreamErrorEvent;

/**
 * Provider-independent token usage. Deliberately flat: the nested OpenAI usage
 * detail objects (cached/reasoning token breakdowns) are never surfaced here.
 */
export interface MarketCompassTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** An incremental chunk of assistant output text. */
export interface TextDeltaEvent {
  type: "text-delta";
  delta: string;
}

/** Terminal success event, emitted exactly once when the model finishes. */
export interface CompletedEvent {
  type: "completed";
  responseId: string;
  requestId: string | null;
  model: string;
  usage: MarketCompassTokenUsage | null;
  /**
   * True when the reply was cut short by the output-token budget: the text
   * already streamed is complete and usable, but the model did not fully
   * finish. The browser keeps the partial answer and shows a neutral note.
   */
  truncated?: boolean;
}

/** Terminal failure event carrying only a stable code and a safe public message. */
export interface StreamErrorEvent {
  type: "error";
  code: AIErrorCode;
  message: string;
}

/**
 * Serializes a single MarketCompass stream event into a valid SSE frame:
 *
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * Only the plain, safe scalar fields of the typed event are serialized. No
 * `Error` object, cause, prompt, conversation history, provider header, API
 * key or raw OpenAI response ever passes through here. The transport encodes
 * the returned string as UTF-8.
 */
export function serializeStreamEvent(event: MarketCompassStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
