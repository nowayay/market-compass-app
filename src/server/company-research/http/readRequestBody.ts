import { RequestBodyTooLargeError } from "../errors.ts";

/**
 * Cancels a request body stream, swallowing any error. Used so rejecting an
 * oversized request never leaves the underlying stream dangling and never turns
 * a 413 into a 500. Does not read the body.
 */
async function cancelBodySafely(body: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // Already cancelled/locked, or cancel unsupported — nothing to do.
  }
}

/**
 * Reads a request body as text while enforcing a hard byte limit.
 *
 * - Streams `request.body`, counting real bytes (`Uint8Array.byteLength`).
 * - Stops and throws `RequestBodyTooLargeError` the moment the limit is
 *   exceeded, cancelling the reader — the whole body is never buffered first.
 * - `Content-Length`, when present, is only a fast pre-check; a request without
 *   it (e.g. chunked/streamed) is still fully protected by the byte counting.
 * - On any rejection the body stream is cancelled without being read.
 * - Never logs the body.
 */
export async function readRequestBodyText(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const body = request.body;

  // Fast pre-rejection using the advertised length (may be absent or lying).
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    // Cancel the untouched stream before rejecting; never read it.
    await cancelBodySafely(body);
    throw new RequestBodyTooLargeError();
  }

  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Reader was already released (e.g. after cancel()); nothing to do.
    }
  }

  // Decode the collected bytes as UTF-8 (handles multi-byte characters).
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
