import { test } from "node:test";
import assert from "node:assert/strict";
import { safeOriginFromUrl } from "../identification/webSourceSecurity.ts";

test("accepts https and returns only origin + hostname", () => {
  assert.deepEqual(safeOriginFromUrl("https://example.com/path?q=1#frag"), {
    origin: "https://example.com",
    hostname: "example.com",
  });
});

test("accepts http (fallback)", () => {
  assert.deepEqual(safeOriginFromUrl("http://example.com"), {
    origin: "http://example.com",
    hostname: "example.com",
  });
});

test("strips personal data in path, query, fragment (origin only)", () => {
  const withName = safeOriginFromUrl("https://example.com/team/jan-kowalski");
  const withEmail = safeOriginFromUrl("https://example.com/x?email=jan.kowalski%40mail.com");
  const withFrag = safeOriginFromUrl("https://example.com/x#pesel-00000000000");
  for (const s of [withName, withEmail, withFrag]) {
    assert.deepEqual(s, { origin: "https://example.com", hostname: "example.com" });
  }
  const serialized = JSON.stringify([withName, withEmail, withFrag]);
  for (const needle of ["kowalski", "email", "pesel", "00000000000", "jan"]) {
    assert.ok(!serialized.includes(needle), `leaked: ${needle}`);
  }
});

test("rejects credentials in the URL", () => {
  assert.equal(safeOriginFromUrl("https://user:pass@example.com"), null);
  assert.equal(safeOriginFromUrl("https://user@example.com"), null);
});

test("rejects dangerous / non-web schemes", () => {
  for (const bad of [
    "data:text/html,hello",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "blob:https://example.com/uuid",
  ]) {
    assert.equal(safeOriginFromUrl(bad), null, bad);
  }
});

test("rejects localhost and its subdomains", () => {
  for (const bad of ["https://localhost/x", "https://sub.localhost", "https://api.localhost:8080"]) {
    assert.equal(safeOriginFromUrl(bad), null, bad);
  }
});

test("rejects ALL IP-literal hosts (private, loopback, public, alternate forms)", () => {
  for (const bad of [
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://192.168.1.1",
    "http://172.16.0.1",
    "http://169.254.1.1",
    "http://0.0.0.0",
    "http://2130706433", // decimal form of 127.0.0.1
    "http://0x7f000001", // hex form of 127.0.0.1
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[::ffff:10.0.0.1]",
    "http://[fe80::1]",
    "http://[fc00::1]",
    "http://93.184.216.34", // public IPv4 literal
    "http://[2606:2800:220:1:248:1893:25c8:1946]", // public IPv6 literal
  ]) {
    assert.equal(safeOriginFromUrl(bad), null, bad);
  }
});

test("allows ordinary DNS domains", () => {
  assert.deepEqual(safeOriginFromUrl("https://example.com"), { origin: "https://example.com", hostname: "example.com" });
  assert.deepEqual(safeOriginFromUrl("https://subdomain.example.com/x"), {
    origin: "https://subdomain.example.com",
    hostname: "subdomain.example.com",
  });
});

test("rejects invalid / non-string URLs", () => {
  assert.equal(safeOriginFromUrl("not a url"), null);
  assert.equal(safeOriginFromUrl(""), null);
  assert.equal(safeOriginFromUrl(undefined), null);
  assert.equal(safeOriginFromUrl(123), null);
});
