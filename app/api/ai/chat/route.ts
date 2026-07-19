import {
  AIConfigError,
  AIError,
  AIProviderError,
} from "@/src/server/ai/errors";
import { chatRequestSchema } from "@/src/server/ai/chat/schema";
import {
  serializeStreamEvent,
  type MarketCompassStreamEvent,
} from "@/src/server/ai/chat/streamProtocol";
import { createChatEventStream } from "@/src/server/ai/services/streamChatResponse";
import { clientIpFrom, createSimpleRateLimiter } from "@/src/server/rateLimit/simpleRateLimiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Simple, process-local per-IP guard against hammering the chat endpoint.
 * NOT a distributed rate limit — see `simpleRateLimiter.ts`. Kept at module
 * scope so the window is shared across every request handled by this warm
 * serverless instance.
 */
const rateLimiter = createSimpleRateLimiter({ windowMs: 5 * 60 * 1000, maxPerWindow: 30 });

/** Stable JSON error envelope returned before streaming has started. */
function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/** Maps a typed provider failure onto an HTTP status without leaking detail. */
function providerHttpStatus(error: AIProviderError): number {
  const status = error.status;
  if (status === 429) {
    // Provider rate limit.
    return 429;
  }
  if (status === undefined || status === 408 || status === 409 || status >= 500) {
    // Network/timeout failure with no HTTP status, or a retryable upstream
    // status (request timeout, conflict, any 5xx) — treat as availability.
    return 503;
  }
  // Any other upstream provider failure (auth, other 4xx, …).
  return 502;
}

/** Builds a safe terminal error event for the SSE stream (after it has begun). */
function toErrorEvent(error: unknown): MarketCompassStreamEvent {
  if (error instanceof AIError) {
    return { type: "error", code: error.code, message: error.publicMessage };
  }
  return {
    type: "error",
    code: "AI_INTERNAL_ERROR",
    message: "MarketCompassAI encountered an unexpected error. Please try again.",
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!rateLimiter.allow(clientIpFrom(request))) {
    return jsonError(429, "RATE_LIMITED", "Zbyt wiele wiadomości w krótkim czasie. Spróbuj ponownie za chwilę.");
  }

  // A. Parse JSON safely.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Nieprawidłowy format żądania.");
  }

  // B. Validate against the chat request schema. Never return raw Zod issues.
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "INVALID_REQUEST", "Nieprawidłowe zapytanie.");
  }

  // Local controller for the streaming operation. Forward the incoming request
  // cancellation to it, and also abort when the ReadableStream is cancelled.
  const controller = new AbortController();
  const onRequestAbort = () => controller.abort();
  if (request.signal.aborted) {
    // Already aborted before we could register a listener — propagate now.
    controller.abort();
  } else {
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
  }

  // Open the provider-backed stream before returning the Response, so config
  // and upstream-open failures become normal JSON error responses (C / D).
  let eventStream: AsyncIterable<MarketCompassStreamEvent>;
  try {
    eventStream = await createChatEventStream(parsed.data.messages, controller.signal, parsed.data.companyContext);
  } catch (error) {
    request.signal.removeEventListener("abort", onRequestAbort);
    if (controller.signal.aborted) {
      // Client disconnected before the stream opened — nothing to report.
      return new Response(null, { status: 499 });
    }
    if (error instanceof AIConfigError) {
      // C. Missing or invalid AI configuration.
      return jsonError(500, error.code, error.publicMessage);
    }
    if (error instanceof AIProviderError) {
      // D. Provider failure while opening the upstream stream.
      return jsonError(providerHttpStatus(error), error.code, error.publicMessage);
    }
    return jsonError(500, "AI_INTERNAL_ERROR", "Wystąpił nieoczekiwany błąd.");
  }

  const encoder = new TextEncoder();
  const iterator = eventStream[Symbol.asyncIterator]();

  let cleanedUp = false;
  const cleanup = () => {
    if (!cleanedUp) {
      cleanedUp = true;
      request.signal.removeEventListener("abort", onRequestAbort);
    }
  };

  // Once true, no further iterator.next(), enqueue() or close() is attempted.
  let finished = false;
  let cancelled = false;

  const finalizeIterator = async () => {
    try {
      await iterator.return?.();
    } catch {
      // The provider stream is already torn down; nothing else to release.
    }
  };

  const safeEnqueue = (
    streamController: ReadableStreamDefaultController<Uint8Array>,
    event: MarketCompassStreamEvent,
  ) => {
    try {
      streamController.enqueue(encoder.encode(serializeStreamEvent(event)));
    } catch {
      // Controller already closed or cancelled; drop the frame.
    }
  };

  const safeClose = (streamController: ReadableStreamDefaultController<Uint8Array>) => {
    try {
      streamController.close();
    } catch {
      // Controller already closed or cancelled.
    }
  };

  const readable = new ReadableStream<Uint8Array>({
    async pull(streamController) {
      if (finished || cancelled) {
        return;
      }

      let result: IteratorResult<MarketCompassStreamEvent>;
      try {
        result = await iterator.next();
      } catch (error) {
        finished = true;
        cleanup();
        // A normal client disconnect is not an error the client can receive.
        if (cancelled || controller.signal.aborted) {
          safeClose(streamController);
          return;
        }
        // Emit exactly one safe error event, then close. The HTTP status has
        // already been sent and cannot be changed here.
        safeEnqueue(streamController, toErrorEvent(error));
        safeClose(streamController);
        return;
      }

      // A cancellation may have landed while awaiting the next event.
      if (cancelled) {
        return;
      }

      if (result.done) {
        finished = true;
        cleanup();
        safeClose(streamController);
        return;
      }

      const event = result.value;
      safeEnqueue(streamController, event);

      // `completed` and `error` are terminal: stop iterating, finalize the
      // provider iterator, and close. No second terminal event is ever sent.
      if (event.type === "completed" || event.type === "error") {
        finished = true;
        cleanup();
        await finalizeIterator();
        safeClose(streamController);
      }
    },
    async cancel() {
      cancelled = true;
      finished = true;
      cleanup();
      controller.abort();
      // Client disconnect: tear down the provider stream, emit no error event.
      await finalizeIterator();
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
