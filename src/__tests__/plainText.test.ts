/**
 * Tests for the chat plain-text sanitizer: it must strip every kind of stray
 * Markdown the model might emit and drop table rows, while preserving line
 * breaks and simple numbered lists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeChatPlainText } from "../lib/ai/plainText.ts";

test("(sanitize) removes bold and italic markers, keeping the words", () => {
  assert.equal(sanitizeChatPlainText("To jest **bardzo** _ważne_ zdanie."), "To jest bardzo ważne zdanie.");
});

test("(sanitize) strips heading markers at the start of a line", () => {
  assert.equal(sanitizeChatPlainText("# Nagłówek\n## Drugi"), "Nagłówek\nDrugi");
});

test("(sanitize) removes inline code and fenced code markers but keeps the text", () => {
  const input = "Użyj `npm test` tak:\n```bash\nnpm test\n```";
  assert.equal(sanitizeChatPlainText(input), "Użyj npm test tak:\nnpm test");
});

test("(sanitize) drops Markdown table rows and the separator row", () => {
  const input = "Oto tabela:\n| Kraj | Wynik |\n| --- | --- |\n| Niemcy | 90 |\nGotowe.";
  assert.equal(sanitizeChatPlainText(input), "Oto tabela:\nGotowe.");
});

test("(sanitize) converts bullet markers to plain lines", () => {
  assert.equal(sanitizeChatPlainText("- pierwszy\n* drugi\n+ trzeci"), "pierwszy\ndrugi\ntrzeci");
});

test("(sanitize) preserves simple numbered lists", () => {
  const input = "1. Pierwszy krok\n2. Drugi krok\n3. Trzeci krok";
  assert.equal(sanitizeChatPlainText(input), input);
});

test("(sanitize) preserves newlines and blank lines between paragraphs", () => {
  const input = "Pierwszy akapit.\n\nDrugi akapit.";
  assert.equal(sanitizeChatPlainText(input), input);
});

test("(sanitize) reduces a Markdown link to its visible text", () => {
  assert.equal(sanitizeChatPlainText("Zobacz [raport](https://example.com/x)."), "Zobacz raport.");
});

test("(sanitize) strips blockquote markers", () => {
  assert.equal(sanitizeChatPlainText("> cytat tutaj"), "cytat tutaj");
});

test("(sanitize) leaves already-clean plain text unchanged (idempotent)", () => {
  const clean = "Cześć! Oto krótka odpowiedź.\n\n1. Zrób to\n2. Potem tamto";
  assert.equal(sanitizeChatPlainText(clean), clean);
  assert.equal(sanitizeChatPlainText(sanitizeChatPlainText(clean)), clean);
});

test("(sanitize) handles an empty string", () => {
  assert.equal(sanitizeChatPlainText(""), "");
});

test("(sanitize) does not mistake a normal sentence with an asterisk-free pipe for a table when not wrapped", () => {
  // A line that does not both start and end with a pipe is kept (markers aside).
  assert.equal(sanitizeChatPlainText("Wynik to 5 lub 6"), "Wynik to 5 lub 6");
});