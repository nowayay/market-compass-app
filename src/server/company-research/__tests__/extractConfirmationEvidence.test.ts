import { test } from "node:test";
import assert from "node:assert/strict";
import { extractConfirmationEvidence } from "../domain-confirmation/extractConfirmationEvidence.ts";

/** Builds a Responses-API-shaped result with attested web-search source URLs. */
function responseWith(...urls: string[]) {
  return {
    status: "completed",
    output_text: "{}",
    output: [
      {
        type: "web_search_call",
        action: { type: "search", sources: urls.map((url) => ({ type: "url", url })) },
      },
    ],
  };
}

// (15) provider-attested on-domain source accepted
test("accepts an attested source on the exact target host", () => {
  const origins = extractConfirmationEvidence(
    responseWith("https://company.example/kontakt"),
    "company.example",
  );
  assert.deepEqual(origins, ["https://company.example"]);
});

// (18) apex/www counterpart accepted
test("accepts the www counterpart of an apex target", () => {
  const origins = extractConfirmationEvidence(
    responseWith("https://www.company.example/o-nas"),
    "company.example",
  );
  assert.deepEqual(origins, ["https://www.company.example"]);
});

test("accepts the apex counterpart of a www target", () => {
  const origins = extractConfirmationEvidence(
    responseWith("https://company.example/o-nas"),
    "www.company.example",
  );
  assert.deepEqual(origins, ["https://company.example"]);
});

// (16) off-domain source rejected
test("rejects an off-domain attested source", () => {
  const origins = extractConfirmationEvidence(
    responseWith("https://aggregator.example/company"),
    "company.example",
  );
  assert.deepEqual(origins, []);
});

// (17) arbitrary subdomain rejected
test("rejects an arbitrary subdomain of the target", () => {
  const origins = extractConfirmationEvidence(
    responseWith("https://blog.company.example/post", "https://shop.company.example/x"),
    "company.example",
  );
  assert.deepEqual(origins, []);
});

// (19/20) path/query/fragment removed, no exact URL survives
test("reduces every source to origin only (no path/query/fragment survives)", () => {
  const origins = extractConfirmationEvidence(
    responseWith("https://company.example/a/b/impressum.html?ref=x&q=1#section"),
    "company.example",
  );
  assert.deepEqual(origins, ["https://company.example"]);
  const dump = JSON.stringify(origins);
  assert.ok(!dump.includes("/a/b"));
  assert.ok(!dump.includes("impressum"));
  assert.ok(!dump.includes("ref=x"));
  assert.ok(!dump.includes("#section"));
});

test("model-text URLs (not attested) are never treated as sources", () => {
  // output_text mentions a URL, but there is no web_search_call/url_citation.
  const origins = extractConfirmationEvidence(
    { status: "completed", output_text: "see https://company.example/secret", output: [] },
    "company.example",
  );
  assert.deepEqual(origins, []);
});

test("credential / IP-literal / localhost sources are rejected and deduplicated", () => {
  const origins = extractConfirmationEvidence(
    responseWith(
      "https://user:pass@company.example/x",
      "http://127.0.0.1/y",
      "https://localhost/z",
      "https://company.example/one",
      "https://company.example/two",
    ),
    "company.example",
  );
  // The two valid same-origin URLs collapse to a single origin; the rest rejected.
  assert.deepEqual(origins, ["https://company.example"]);
});
