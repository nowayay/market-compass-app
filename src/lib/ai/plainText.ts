/**
 * Browser-safe fallback that coerces an assistant reply into plain text.
 *
 * The chat prompt already instructs MarketCompassAI to answer in plain text
 * with no Markdown, but a model can still slip in a stray `**bold**`, a `#`
 * heading, a fenced code block or a whole Markdown table. This sanitizer is the
 * last line of defense before rendering: it strips Markdown markup and drops
 * table rows while PRESERVING line breaks and simple numbered lists, so the
 * text renders cleanly with `white-space: pre-wrap`.
 *
 * It is intentionally conservative and line-oriented — it never reflows or
 * reorders content, it only removes formatting characters.
 */

/** A fenced-code delimiter line (``` or ~~~), optionally with a language tag. */
const FENCE_RE = /^\s*(```|~~~)/;
/** A Markdown table separator row, e.g. `| --- | :--: |` or `---|---`. */
const TABLE_SEPARATOR_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
/** A Markdown table data row: starts and ends with a pipe (`| a | b |`). */
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
/** A leading heading marker (`#`, `##`, …). */
const HEADING_RE = /^(\s{0,3})#{1,6}\s+/;
/** A leading blockquote marker (`>`). */
const BLOCKQUOTE_RE = /^(\s{0,3})>\s?/;
/** A leading bullet-list marker (`-`, `*`, `+`) — numbered lists are kept. */
const BULLET_RE = /^(\s*)[-*+]\s+/;
/** A Markdown link `[text](url)` — reduced to just its visible text. */
const LINK_RE = /\[([^\]]+)\]\((?:[^)]*)\)/g;

/** Removes inline Markdown emphasis / code markers from a single line. */
function stripInlineMarkers(line: string): string {
  return line
    .replace(LINK_RE, "$1")
    // Multi-char emphasis first so their halves are not left behind.
    .replace(/\*\*|__|~~/g, "")
    // Remaining single emphasis / inline-code characters.
    .replace(/[*_`]/g, "");
}

/**
 * Sanitizes a (possibly partial, mid-stream) assistant message into plain text.
 * Idempotent and safe to call on every render of the growing streamed text.
 */
export function sanitizeChatPlainText(input: string): string {
  if (!input) return input;

  const lines = input.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const original of lines) {
    // Fenced code blocks: drop the fence markers themselves; keep inner lines as
    // plain text (with any inline markers stripped below).
    if (FENCE_RE.test(original)) {
      inFence = !inFence;
      continue;
    }

    const trimmed = original.trim();

    // Drop Markdown table rows and separator rows entirely.
    if (TABLE_SEPARATOR_RE.test(trimmed) || TABLE_ROW_RE.test(trimmed)) {
      continue;
    }

    let line = original;
    line = line.replace(HEADING_RE, "$1");
    line = line.replace(BLOCKQUOTE_RE, "$1");
    line = line.replace(BULLET_RE, "$1");
    line = stripInlineMarkers(line);

    // Collapse runs of spaces left behind by removed markers (but keep leading
    // indentation and never touch newlines).
    line = line.replace(/([^\s]) {2,}/g, "$1 ").replace(/\s+$/g, "");

    out.push(line);
  }

  return out.join("\n");
}
