/**
 * Tests for the country-details HTTP handler: request validation, the success
 * envelope, and safe error-status mapping for timeout / invalid-response /
 * provider failures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCountryDetails } from "../countryDetails/httpHandler.ts";
import {
  CountryDetailsError,
  CountryDetailsTimeoutError,
  InvalidCountryDetailsResponseError,
} from "../countryDetails/errors.ts";
import type { CountryDetails } from "../../../contracts/countryDetails.ts";
import type { CountryDetailsProvider } from "../countryDetails/types.ts";

function details(): CountryDetails {
  return {
    scoreRationale: "Uzasadnienie.",
    opportunities: ["a", "b", "c", "d"],
    risks: ["e", "f", "g", "h"],
    customerSegments: ["s1", "s2", "s3"],
    competition: "Konkurencja.",
    entryModel: "Model.",
    barriers: ["b1", "b2", "b3"],
    firstSteps: ["k1", "k2", "k3"],
    confidenceLevel: "medium",
    confidenceRationale: "Bo tak.",
  };
}

const VALID_BODY = {
  company: { legalName: "Przykład Sp. z o.o.", productsServices: [], customerSegments: [], operatingMarkets: [] },
  country: { countryCode: "DE", countryName: "Niemcy", score: 88 },
};

function request(body: unknown): Request {
  return new Request("http://localhost/api/company-research/country-details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function provider(generate: CountryDetailsProvider["generate"]): CountryDetailsProvider {
  return { name: "fake", generate };
}

test("(handler) a valid request returns 200 with the details envelope", async () => {
  const res = await handleCountryDetails(request(VALID_BODY), { provider: provider(async () => details()) });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.details, details());
});

test("(handler) malformed JSON is a 400", async () => {
  const res = await handleCountryDetails(request("{not json"), { provider: provider(async () => details()) });
  assert.equal(res.status, 400);
});

test("(handler) an invalid request body is a 400", async () => {
  const res = await handleCountryDetails(request({ country: { countryCode: "DE" } }), {
    provider: provider(async () => details()),
  });
  assert.equal(res.status, 400);
});

test("(handler) a timeout maps to 504 with the stable code", async () => {
  const res = await handleCountryDetails(request(VALID_BODY), {
    provider: provider(async () => { throw new CountryDetailsTimeoutError(); }),
  });
  assert.equal(res.status, 504);
  const json = await res.json();
  assert.equal(json.error.code, "COUNTRY_DETAILS_TIMEOUT");
});

test("(handler) an invalid model response maps to 502", async () => {
  const res = await handleCountryDetails(request(VALID_BODY), {
    provider: provider(async () => { throw new InvalidCountryDetailsResponseError("bad"); }),
  });
  assert.equal(res.status, 502);
});

test("(handler) a provider/transport failure maps to 503", async () => {
  const res = await handleCountryDetails(request(VALID_BODY), {
    provider: provider(async () => { throw new CountryDetailsError("boom"); }),
  });
  assert.equal(res.status, 503);
});

test("(handler) never leaks a raw internal error message", async () => {
  const res = await handleCountryDetails(request(VALID_BODY), {
    provider: provider(async () => { throw new Error("raw secret detail"); }),
  });
  assert.equal(res.status, 500);
  const text = await res.text();
  assert.ok(!text.includes("raw secret detail"));
});
