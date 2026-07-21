/**
 * Tests for the streaming chat client's truncation handling:
 * - a long reply that ends normally resolves "completed",
 * - a long reply cut short by the token budget (completed{truncated:true})
 *   resolves "truncated" while keeping all streamed text,
 * - a stream interrupted (error frame / abrupt end) AFTER useful text resolves
 *   "truncated" and never throws,
 * - an error / empty stream with NO text still throws a safe ChatClientError.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { streamChat, ChatClientError } from "../lib/ai/chatClient.ts";
import type { ChatRequestMessage } from "../lib/ai/chatClient.ts";

const MESSAGES: ChatRequestMessage[] = [{ role: "user", content: "Cześć" }];

function frame(type: string, extra: Record<string, unknown> = {}): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
}

function deltaFrame(text: string): string {
  return frame("text-delta", { delta: text });
}

function completedFrame(truncated: boolean): string {
  return frame("completed", { responseId: "resp_1", requestId: null, model: "test-model", usage: null, truncated });
}

/** Stubs global.fetch to stream the given SSE chunks; returns a restore fn. */
function stubFetch(chunks: string[], ok = true, status = 200): () => void {
  const original = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(ok ? body : null, {
      status,
      headers: { "Content-Type": "text/event-stream" },
    });
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

function collector() {
  let text = "";
  return { onTextDelta: (d: string) => { text += d; }, get text() { return text; } };
}

test("(chat stream) a long reply that ends normally resolves 'completed' with all text", async () => {
  const parts = Array.from({ length: 60 }, (_, i) => `zdanie numer ${i} `);
  const restore = stubFetch([...parts.map(deltaFrame), completedFrame(false)]);
  try {
    const c = collector();
    const status = await streamChat(MESSAGES, c, new AbortController().signal);
    assert.equal(status, "completed");
    assert.equal(c.text, parts.join(""));
  } finally {
    restore();
  }
});

test("(chat stream) a long reply cut off by the token budget resolves 'truncated' and keeps the text", async () => {
  const parts = Array.from({ length: 200 }, (_, i) => `bardzo długa treść ${i} `);
  const restore = stubFetch([...parts.map(deltaFrame), completedFrame(true)]);
  try {
    const c = collector();
    const status = await streamChat(MESSAGES, c, new AbortController().signal);
    assert.equal(status, "truncated");
    assert.equal(c.text, parts.join(""));
  } finally {
    restore();
  }
});

test("(chat stream) an error frame AFTER useful text resolves 'truncated' and does not throw", async () => {
  const restore = stubFetch([
    deltaFrame("Zaczynam odpowiadać "),
    deltaFrame("i mam już sensowną treść."),
    frame("error", { code: "AI_INVALID_RESPONSE", message: "boom" }),
  ]);
  try {
    const c = collector();
    const status = await streamChat(MESSAGES, c, new AbortController().signal);
    assert.equal(status, "truncated");
    assert.equal(c.text, "Zaczynam odpowiadać i mam już sensowną treść.");
  } finally {
    restore();
  }
});

test("(chat stream) a stream that ends WITHOUT a terminal event but WITH text resolves 'truncated'", async () => {
  const restore = stubFetch([deltaFrame("Częściowa "), deltaFrame("odpowiedź bez zakończenia.")]);
  try {
    const c = collector();
    const status = await streamChat(MESSAGES, c, new AbortController().signal);
    assert.equal(status, "truncated");
    assert.equal(c.text, "Częściowa odpowiedź bez zakończenia.");
  } finally {
    restore();
  }
});

test("(chat stream) an error frame with NO prior text throws a safe ChatClientError", async () => {
  const restore = stubFetch([frame("error", { code: "AI_PROVIDER_ERROR", message: "boom" })]);
  try {
    await assert.rejects(
      () => streamChat(MESSAGES, collector(), new AbortController().signal),
      ChatClientError,
    );
  } finally {
    restore();
  }
});

test("(chat stream) an empty stream with no text and no terminal event throws ChatClientError", async () => {
  const restore = stubFetch([]);
  try {
    await assert.rejects(
      () => streamChat(MESSAGES, collector(), new AbortController().signal),
      ChatClientError,
    );
  } finally {
    restore();
  }
});

test("(chat stream) whitespace-only deltas do not count as useful text (error still throws)", async () => {
  const restore = stubFetch([deltaFrame("   \n  "), frame("error", { code: "AI_INTERNAL_ERROR" })]);
  try {
    await assert.rejects(
      () => streamChat(MESSAGES, collector(), new AbortController().signal),
      ChatClientError,
    );
  } finally {
    restore();
  }
});

test("(chat stream) a delta split across two network chunks is still delivered whole", async () => {
  // First chunk carries a partial SSE frame; the boundary only completes in the
  // second chunk — the client must buffer and reassemble it.
  const full = deltaFrame("Sklejona wiadomość");
  const split = Math.floor(full.length / 2);
  const restore = stubFetch([full.slice(0, split), full.slice(split), completedFrame(false)]);
  try {
    const c = collector();
    const status = await streamChat(MESSAGES, c, new AbortController().signal);
    assert.equal(status, "completed");
    assert.equal(c.text, "Sklejona wiadomość");
  } finally {
    restore();
  }
});
