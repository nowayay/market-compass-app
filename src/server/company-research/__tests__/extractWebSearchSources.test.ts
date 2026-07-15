import { test } from "node:test";
import assert from "node:assert/strict";
import { extractWebSearchSources } from "../identification/extractWebSearchSources.ts";

test("extracts real sources from web_search_call.action.sources", () => {
  const response = {
    output: [
      {
        type: "web_search_call",
        action: {
          type: "search",
          sources: [
            { type: "url", url: "https://real1.com/team/jan-kowalski" },
            { type: "url", url: "https://real2.com/x?email=a@b.com" },
          ],
        },
      },
    ],
  };
  const sources = extractWebSearchSources(response);
  assert.deepEqual(sources.map((s) => s.origin).sort(), ["https://real1.com", "https://real2.com"]);
  // No path/query/personal data survives.
  const serialized = JSON.stringify(sources);
  for (const needle of ["jan-kowalski", "team", "email", "a@b.com"]) {
    assert.ok(!serialized.includes(needle), `leaked: ${needle}`);
  }
});

test("ignores URLs that appear only in output_text", () => {
  const response = {
    output: [
      {
        type: "message",
        content: [
          { type: "output_text", text: "According to https://model-hallucinated.com this is true.", annotations: [] },
        ],
      },
    ],
  };
  assert.deepEqual(extractWebSearchSources(response), []);
});

test("uses url_citation annotations as real sources (title/path dropped)", () => {
  const response = {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "x",
            annotations: [
              { type: "url_citation", url: "https://citation.com/article?author=jan-kowalski", title: "Jan Kowalski w zarządzie" },
            ],
          },
        ],
      },
    ],
  };
  const sources = extractWebSearchSources(response);
  assert.deepEqual(sources, [{ origin: "https://citation.com", hostname: "citation.com" }]);
  assert.ok(!JSON.stringify(sources).toLowerCase().includes("kowalski"));
});

test("no sources present → does not fall back to model text URLs", () => {
  const response = {
    output: [
      { type: "web_search_call", action: { type: "search", sources: [] } },
      { type: "message", content: [{ type: "output_text", text: "https://model.example", annotations: [] }] },
    ],
  };
  assert.deepEqual(extractWebSearchSources(response), []);
});

test("ignores web_search_call.action.url (open_page/find targets are not sources)", () => {
  const response = {
    output: [
      { type: "web_search_call", action: { type: "open_page", url: "https://opened.example/page" } },
      { type: "web_search_call", action: { type: "find", url: "https://found.example", pattern: "x" } },
    ],
  };
  // No action.sources and no citations → no sources (no fallback to action.url).
  assert.deepEqual(extractWebSearchSources(response), []);
});

test("deduplicates by origin across search-source items", () => {
  const response = {
    output: [
      { type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: "https://dup.com/a" }] } },
      { type: "web_search_call", action: { type: "search", sources: [{ type: "url", url: "https://dup.com/b" }] } },
      { type: "unknown_item_type", foo: 1 },
    ],
  };
  const sources = extractWebSearchSources(response);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].origin, "https://dup.com");
});

test("returns empty for a malformed response", () => {
  assert.deepEqual(extractWebSearchSources(null), []);
  assert.deepEqual(extractWebSearchSources({}), []);
  assert.deepEqual(extractWebSearchSources({ output: "nope" }), []);
});
