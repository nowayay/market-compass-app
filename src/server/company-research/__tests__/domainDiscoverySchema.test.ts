import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DOMAIN_DISCOVERY_JSON_SCHEMA,
  MAX_DOMAIN_CANDIDATES,
  parseDomainDiscoveryOutput,
} from "../domain-discovery/schema.ts";
import { InvalidDomainDiscoveryResponseError } from "../domain-discovery/errors.ts";
import { PersonalDataLeakError } from "../privacy/assertNoPersonalData.ts";

test("JSON Schema is strict: additionalProperties false and no title/snippet/confidence", () => {
  const schema = DOMAIN_DISCOVERY_JSON_SCHEMA;
  assert.equal(schema.additionalProperties, false);
  const props = schema.properties as Record<string, Record<string, unknown>>;
  const item = props.candidates.items as Record<string, unknown>;
  assert.equal(item.additionalProperties, false);
  const itemProps = item.properties as Record<string, unknown>;
  const keys = Object.keys(itemProps).sort();
  assert.deepEqual(keys, [
    "matchedCity", "matchedKrs", "matchedLegalName", "matchedNip", "matchedRegon", "url",
  ]);
  for (const forbidden of ["title", "snippet", "description", "confidence", "verified", "content"]) {
    assert.ok(!(forbidden in itemProps), `schema exposes ${forbidden}`);
  }
  assert.equal(props.candidates.maxItems, MAX_DOMAIN_CANDIDATES);
});

test("parses a JSON string payload and maps only allowlisted signals", () => {
  const out = parseDomainDiscoveryOutput(
    JSON.stringify({
      candidates: [
        { url: "https://c.example/x", matchedLegalName: "C SP. Z O.O.", matchedKrs: "0000000001", matchedNip: null, matchedRegon: null, matchedCity: "Warszawa", title: "IGNORED", snippet: "IGNORED" },
      ],
    }),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://c.example/x");
  assert.deepEqual(Object.keys(out[0].signals).sort(), [
    "matchedCity", "matchedKrs", "matchedLegalName", "matchedNip", "matchedRegon",
  ]);
  assert.equal(out[0].signals.matchedCity, "Warszawa");
});

test("throws on non-JSON string output", () => {
  assert.throws(() => parseDomainDiscoveryOutput("<<<not json>>>"), InvalidDomainDiscoveryResponseError);
});

test("throws when the candidates array is missing", () => {
  assert.throws(() => parseDomainDiscoveryOutput({ foo: 1 }), InvalidDomainDiscoveryResponseError);
});

test("caps the parsed candidates at the maximum", () => {
  const out = parseDomainDiscoveryOutput({
    candidates: Array.from({ length: 6 }, (_v, i) => ({
      url: `https://c${i}.example/x`,
      matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: null,
    })),
  });
  assert.equal(out.length, MAX_DOMAIN_CANDIDATES);
});

test("privacy guard runs over mapped signals (email in a signal is rejected)", () => {
  assert.throws(
    () =>
      parseDomainDiscoveryOutput({
        candidates: [
          { url: "https://c.example/x", matchedLegalName: null, matchedKrs: null, matchedNip: null, matchedRegon: null, matchedCity: "kontakt jan.kowalski@example.com" },
        ],
      }),
    (e: unknown) => e instanceof PersonalDataLeakError && e.code === "EMAIL_ADDRESS",
  );
});

test("valid registry identifiers in signals are NOT treated as phone numbers", () => {
  assert.doesNotThrow(() =>
    parseDomainDiscoveryOutput({
      candidates: [
        { url: "https://c.example/x", matchedLegalName: "C SP. Z O.O.", matchedKrs: "0000000001", matchedNip: "1234563218", matchedRegon: "123456785", matchedCity: "Warszawa" },
      ],
    }),
  );
});
