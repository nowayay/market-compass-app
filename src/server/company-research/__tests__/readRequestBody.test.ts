import { test } from "node:test";
import assert from "node:assert/strict";
import { readRequestBodyText } from "../http/readRequestBody.ts";
import { RequestBodyTooLargeError } from "../errors.ts";

function stringRequest(body: string): Request {
  return new Request("http://x/", { method: "POST", body });
}

/** Build a request with a streamed body and NO Content-Length header. */
function streamRequest(bytes: Uint8Array): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Request("http://x/", {
    method: "POST",
    body: stream,
    duplex: "half",
  } as unknown as RequestInit);
}

test("reads a body below the limit", async () => {
  const text = await readRequestBodyText(stringRequest("hello"), 1024);
  assert.equal(text, "hello");
});

test("accepts a body exactly at the limit", async () => {
  const body = "a".repeat(10); // 10 ASCII bytes
  const text = await readRequestBodyText(stringRequest(body), 10);
  assert.equal(text, body);
});

test("rejects a body above the limit (Content-Length pre-check)", async () => {
  await assert.rejects(
    () => readRequestBodyText(stringRequest("a".repeat(11)), 10),
    RequestBodyTooLargeError,
  );
});

test("enforces the limit without a Content-Length header (streamed)", async () => {
  const under = new TextEncoder().encode("12345"); // 5 bytes
  assert.equal(await readRequestBodyText(streamRequest(under), 10), "12345");

  const over = new TextEncoder().encode("12345678901"); // 11 bytes
  await assert.rejects(
    () => readRequestBodyText(streamRequest(over), 10),
    RequestBodyTooLargeError,
  );
});

test("counts real UTF-8 bytes for multi-byte characters", async () => {
  // "ł" is 2 bytes in UTF-8; six of them = 12 bytes.
  const six = "ł".repeat(6);
  const bytes = new TextEncoder().encode(six);
  assert.equal(bytes.byteLength, 12);

  await assert.rejects(
    () => readRequestBodyText(streamRequest(bytes), 11),
    RequestBodyTooLargeError,
  );
  assert.equal(await readRequestBodyText(streamRequest(bytes), 12), six);
});

test("Content-Length over limit cancels the stream WITHOUT reading it", async () => {
  let cancelled = false;
  let getReaderCalled = false;
  // A body double we fully control, so we can assert it is cancelled and never read.
  const body = {
    cancel: async () => {
      cancelled = true;
    },
    getReader: () => {
      getReaderCalled = true;
      throw new Error("body must not be read on the Content-Length pre-check");
    },
  } as unknown as ReadableStream<Uint8Array>;

  const request = {
    headers: { get: (k: string) => (k.toLowerCase() === "content-length" ? "999999" : null) },
    body,
  } as unknown as Request;

  await assert.rejects(() => readRequestBodyText(request, 10), RequestBodyTooLargeError);
  assert.equal(cancelled, true); // stream was cancelled
  assert.equal(getReaderCalled, false); // body was never read
});

test("an empty body yields an empty string", async () => {
  const text = await readRequestBodyText(
    new Request("http://x/", { method: "POST" }),
    1024,
  );
  assert.equal(text, "");
});
