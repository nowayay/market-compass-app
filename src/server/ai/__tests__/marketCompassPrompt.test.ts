/**
 * Tests for the MarketCompassAI chat prompt (v2 MVP voice): the active
 * instructions must force Polish, a casual tone, and strict plain-text output
 * with no Markdown, while still allowing short paragraphs and simple numbered
 * lists. Imports the plain (non-`server-only`) text module so it runs in Node.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARKET_COMPASS_INSTRUCTIONS,
  MARKET_COMPASS_INSTRUCTIONS_V3,
} from "../prompts/marketCompassText.ts";

// Whitespace-normalized copy so phrase assertions are robust to line wrapping.
const FLAT = MARKET_COMPASS_INSTRUCTIONS.replace(/\s+/g, " ");

test("(prompt) the active instructions are the v3 short/casual plain-text/Polish voice", () => {
  assert.equal(MARKET_COMPASS_INSTRUCTIONS, MARKET_COMPASS_INSTRUCTIONS_V3);
});

test("(prompt) enforces brevity: short answers, ~600 words, at most 5 examples", () => {
  assert.match(FLAT, /Keep answers SHORT/);
  assert.match(FLAT, /600 words/);
  assert.match(FLAT, /AT MOST the 5 most important/);
});

test("(prompt) handles broad comparisons with key players + short takeaways, not everything", () => {
  assert.match(FLAT, /broad or "compare everything" comparison/);
  assert.match(FLAT, /do NOT try to cover every option/i);
  assert.match(FLAT, /overall conclusion/);
});

test("(prompt) forces Polish replies regardless of the user's language", () => {
  assert.match(FLAT, /ALWAYS reply in Polish/);
  assert.match(FLAT, /regardless of the language/i);
});

test("(prompt) asks for a casual, natural tone", () => {
  assert.match(FLAT, /casually and naturally/i);
});

test("(prompt) mandates plain text and forbids Markdown / tables / code / formulas / bold", () => {
  assert.match(FLAT, /PLAIN TEXT ONLY/);
  assert.match(FLAT, /Do NOT use Markdown/);
  for (const forbidden of [/asterisks/i, /heading marks/i, /bold/i, /tables/i, /code blocks/i, /backticks/i, /formulas or LaTeX/i]) {
    assert.match(FLAT, forbidden);
  }
});

test("(prompt) still allows short paragraphs and simple numbered lists", () => {
  assert.match(FLAT, /short paragraphs/i);
  assert.match(FLAT, /numbered lists/i);
});

test("(prompt) keeps the factual-honesty guardrails", () => {
  assert.match(FLAT, /Never invent current company, legal, financial, or market data/);
  assert.match(FLAT, /Do not claim to have searched the web/);
});
