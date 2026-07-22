import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedDomain } from "../domain-discovery/blockedDomains.ts";

test("blocks search engines, social, encyclopedias, directories, marketplaces", () => {
  for (const host of [
    "google.com", "bing.com", "facebook.com", "instagram.com", "linkedin.com",
    "x.com", "twitter.com", "youtube.com", "reddit.com", "wikipedia.org",
    "rejestr.io", "aleo.com", "panoramafirm.pl", "allegro.pl", "pracuj.pl",
    "trustpilot.com", "bit.ly", "sedo.com",
  ]) {
    assert.ok(isBlockedDomain(host), `expected blocked: ${host}`);
  }
});

test("blocks subdomains of blocked domains", () => {
  for (const host of [
    "careers.linkedin.com", "pl.wikipedia.org", "m.facebook.com", "www.rejestr.io",
  ]) {
    assert.ok(isBlockedDomain(host), `expected blocked subdomain: ${host}`);
  }
});

test("is case-insensitive", () => {
  assert.ok(isBlockedDomain("LinkedIn.com"));
});

test("does not block ordinary company domains", () => {
  for (const host of [
    "company.example", "nordicfurniture.example", "przykladowa.pl", "acme.co.uk",
    "notlinkedin.com", "linkedin.company.example",
  ]) {
    assert.ok(!isBlockedDomain(host), `unexpectedly blocked: ${host}`);
  }
});
