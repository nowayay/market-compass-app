/**
 * Browser-side client for the MarketCompass streaming chat endpoint.
 *
 * This module is browser-only: it must never import server code, touch
 * process.env, use the OpenAI SDK, or carry a "server-only" marker. It POSTs
 * the conversation to /api/ai/chat and parses the MarketCompass SSE protocol
 * out of the fetch response body.
 */

/** A single message sent to the endpoint. */
export interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

/** Flat, provider-independent token usage mirrored from the SSE protocol. */
export interface ChatTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/** Terminal success event payload. */
export interface ChatCompletedEvent {
  type: "completed";
  responseId: string;
  requestId: string | null;
  model: string;
  usage: ChatTokenUsage | null;
}

/** Callbacks invoked while consuming the stream. */
export interface StreamChatCallbacks {
  /** Called for every non-empty text delta, in order. */
  onTextDelta: (delta: string) => void;
  /** Called once when the stream completes successfully. */
  onCompleted?: (event: ChatCompletedEvent) => void;
}

/** Backend request/response limits (kept in sync with the server schema). */
export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_TOTAL_CHARS = 20000;

/** Safe, user-facing fallback shown when nothing more specific is available. */
const GENERIC_ERROR_MESSAGE =
  "Nie udało się uzyskać odpowiedzi MarketCompassAI. Spróbuj ponownie.";

/**
 * A client-side error carrying only a safe, user-facing message. It never holds
 * stack traces, provider bodies or raw error codes destined for display.
 */
export class ChatClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatClientError";
  }
}

/**
 * Maps a stable server error code onto a safe Polish message. Raw server
 * message strings, codes, bodies and provider data are never surfaced.
 */
function messageForCode(code: unknown): string {
  switch (code) {
    case "INVALID_JSON":
    case "INVALID_REQUEST":
      return "Nieprawidłowe zapytanie.";
    case "AI_CONFIG_ERROR":
      return "Usługa MarketCompassAI nie jest poprawnie skonfigurowana.";
    case "AI_PROVIDER_ERROR":
      return "MarketCompassAI jest chwilowo niedostępny. Spróbuj ponownie.";
    case "AI_INVALID_RESPONSE":
      return "MarketCompassAI nie wygenerował poprawnej odpowiedzi. Spróbuj ponownie.";
    default:
      // AI_INTERNAL_ERROR and any unknown code.
      return GENERIC_ERROR_MESSAGE;
  }
}

/** Narrow an unknown value to a plain object without using `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True for an abort raised by the supplied AbortSignal (user cancellation). */
export function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

/**
 * Prepares the request history within the backend limits:
 * - trims content and drops empty messages (including empty assistant
 *   placeholders),
 * - caps each message at MAX_MESSAGE_CHARS,
 * - appends the new user message as the final entry,
 * - keeps the newest messages that fit within both MAX_MESSAGES and
 *   MAX_TOTAL_CHARS, preserving chronological order.
 */
export function prepareRequestHistory(
  history: ReadonlyArray<ChatRequestMessage>,
  newUserContent: string,
): ChatRequestMessage[] {
  const cleaned = history
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_MESSAGE_CHARS),
    }))
    .filter((message) => message.content.length > 0);

  const finalMessage: ChatRequestMessage = {
    role: "user",
    content: newUserContent.trim().slice(0, MAX_MESSAGE_CHARS),
  };

  const all = [...cleaned, finalMessage];

  // Select from the newest backwards so the final user message is always kept.
  const selected: ChatRequestMessage[] = [];
  let total = 0;
  for (let i = all.length - 1; i >= 0; i--) {
    const message = all[i];
    if (selected.length >= MAX_MESSAGES) break;
    if (selected.length > 0 && total + message.content.length > MAX_TOTAL_CHARS) break;
    selected.push(message);
    total += message.content.length;
  }
  selected.reverse();
  return selected;
}

/**
 * Reads the stable error code from a non-2xx JSON error response and maps it to
 * a safe Polish message. The raw server message is never used. Never throws.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body.error)) {
      return messageForCode(body.error.code);
    }
  } catch {
    // Body was not JSON, or already consumed — fall through to the generic.
  }
  return GENERIC_ERROR_MESSAGE;
}

interface Boundary {
  index: number;
  length: number;
}

/** Finds the earliest SSE frame boundary (`\n\n` or `\r\n\r\n`) in the buffer. */
function findBoundary(buffer: string): Boundary | null {
  const crlf = buffer.indexOf("\r\n\r\n");
  const lf = buffer.indexOf("\n\n");
  if (crlf === -1 && lf === -1) return null;
  if (crlf === -1) return { index: lf, length: 2 };
  if (lf === -1) return { index: crlf, length: 4 };
  return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
}

/** Parses one SSE frame into its event name and concatenated data payload. */
function parseFrame(frame: string): { event: string | null; data: string } {
  let event: string | null = null;
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).replace(/^ /, ""));
    }
    // Other lines (comments, id:, retry:) are ignored.
  }
  return { event, data: dataLines.join("\n") };
}

/** Builds a validated ChatCompletedEvent, or null if the payload is malformed. */
function toCompletedEvent(payload: Record<string, unknown>): ChatCompletedEvent | null {
  if (typeof payload.responseId !== "string" || typeof payload.model !== "string") {
    return null;
  }
  const requestId =
    payload.requestId === null || typeof payload.requestId === "string"
      ? payload.requestId
      : null;

  let usage: ChatTokenUsage | null = null;
  if (isRecord(payload.usage)) {
    const u = payload.usage;
    if (
      typeof u.inputTokens === "number" &&
      typeof u.outputTokens === "number" &&
      typeof u.totalTokens === "number"
    ) {
      usage = {
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
      };
    }
  }

  return {
    type: "completed",
    responseId: payload.responseId,
    requestId,
    model: payload.model,
    usage,
  };
}

type FrameOutcome = "delta" | "completed" | "ignore";

/**
 * Handles a single parsed frame. Emits deltas via the callbacks, signals a
 * terminal `completed`, or throws a safe ChatClientError for an `error` event
 * or malformed terminal data. Unknown/non-terminal malformed frames are ignored.
 */
function handleFrame(frame: string, callbacks: StreamChatCallbacks): FrameOutcome {
  const { event, data } = parseFrame(frame);
  if (data.length === 0 && event === null) return "ignore";

  let payload: unknown;
  let parsed = true;
  try {
    payload = JSON.parse(data);
  } catch {
    parsed = false;
  }

  const record = parsed && isRecord(payload) ? payload : null;
  const type = record && typeof record.type === "string" ? record.type : null;

  // Determine the discriminant from the data payload, falling back to the
  // SSE `event:` line so a terminal frame is still recognized when its data
  // fails to parse.
  const kind = type ?? event;

  if (kind === "error") {
    // Map the stable code to a safe Polish message; never surface raw fields.
    throw new ChatClientError(record ? messageForCode(record.code) : GENERIC_ERROR_MESSAGE);
  }

  if (kind === "completed") {
    const completed = record ? toCompletedEvent(record) : null;
    if (!completed) {
      // Terminal event with malformed data is a safe client error.
      throw new ChatClientError(GENERIC_ERROR_MESSAGE);
    }
    callbacks.onCompleted?.(completed);
    return "completed";
  }

  if (kind === "text-delta") {
    if (record && typeof record.delta === "string" && record.delta.length > 0) {
      callbacks.onTextDelta(record.delta);
    }
    return "delta";
  }

  // Unknown or non-terminal malformed event — ignore safely.
  return "ignore";
}

/**
 * POSTs the conversation to /api/ai/chat and streams the reply. Resolves after
 * a `completed` event. Rejects with a ChatClientError (safe message) for
 * pre-stream API errors, an SSE `error` event, a missing body, or a stream that
 * ends without a terminal event. A user abort propagates as an AbortError.
 */
export async function streamChat(
  messages: ChatRequestMessage[],
  callbacks: StreamChatCallbacks,
  signal: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ChatClientError(GENERIC_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new ChatClientError(await readErrorMessage(response));
  }
  if (!response.body) {
    throw new ChatClientError(GENERIC_ERROR_MESSAGE);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminated = false;

  try {
    while (!terminated) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = findBoundary(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        if (handleFrame(frame, callbacks) === "completed") {
          terminated = true;
          break;
        }
        boundary = findBoundary(buffer);
      }
    }
  } finally {
    // Stop reading once we are done (terminal event, error, or abort).
    try {
      await reader.cancel();
    } catch {
      // Reader already released; nothing else to do.
    }
  }

  if (!terminated) {
    throw new ChatClientError(GENERIC_ERROR_MESSAGE);
  }
}
