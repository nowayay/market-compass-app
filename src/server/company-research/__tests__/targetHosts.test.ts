import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedDomainsFor,
  isTargetHost,
  targetHostSet,
} from "../domain-confirmation/targetHosts.ts";

test("apex host maps to itself + its www counterpart", () => {
  assert.deepEqual([...targetHostSet("company.example")].sort(), [
    "company.example",
    "www.company.example",
  ]);
});

test("www host maps to itself + its apex counterpart", () => {
  assert.deepEqual([...targetHostSet("www.company.example")].sort(), [
    "company.example",
    "www.company.example",
  ]);
});

test("allowedDomainsFor returns a deterministic, sorted pair", () => {
  assert.deepEqual(allowedDomainsFor("company.example"), [
    "company.example",
    "www.company.example",
  ]);
  assert.deepEqual(allowedDomainsFor("WWW.Company.Example"), [
    "company.example",
    "www.company.example",
  ]);
});

test("isTargetHost accepts only the host and its exact www/apex counterpart", () => {
  assert.ok(isTargetHost("company.example", "company.example"));
  assert.ok(isTargetHost("www.company.example", "company.example"));
  assert.ok(isTargetHost("company.example", "www.company.example"));
});

test("isTargetHost rejects arbitrary subdomains and unrelated hosts", () => {
  assert.ok(!isTargetHost("blog.company.example", "company.example"));
  assert.ok(!isTargetHost("shop.company.example", "company.example"));
  assert.ok(!isTargetHost("company.example.evil.com", "company.example"));
  assert.ok(!isTargetHost("notcompany.example", "company.example"));
});
