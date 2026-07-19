"use client";

// A minimal Markdown-to-React renderer for chat responses. Deliberately does
// NOT use dangerouslySetInnerHTML: every node below is a real React element,
// so there is no HTML-injection surface. Supports the subset of Markdown the
// chat model is asked to use — headings, bold, and bullet/numbered lists —
// plus plain paragraphs with line breaks.
import { Fragment } from "react";
import type { ReactNode } from "react";

/** Splits one line into text/bold runs (`**bold**`) as safe React nodes. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g).filter((part) => part.length > 0);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "paragraph"; lines: string[] };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const UL_RE = /^[-*]\s+(.*)$/;
const OL_RE = /^\d+\.\s+(.*)$/;

/** Groups raw lines into heading / list / paragraph blocks. */
function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(UL_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(OL_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !HEADING_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }

  return blocks;
}

const HEADING_SIZE: Record<number, number> = { 1: 16, 2: 14.5, 3: 13.5 };

/** Renders chat Markdown as real React elements — never raw `#`/`**` markers. */
export default function MarkdownText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, bi) => {
        const spaced = bi > 0 ? { marginTop: 8 } : undefined;
        if (block.type === "heading") {
          return (
            <div key={bi} style={{ ...spaced, fontWeight: 800, fontSize: HEADING_SIZE[block.level] ?? 13.5 }}>
              {renderInline(block.text, `h${bi}`)}
            </div>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={bi} style={{ ...spaced, margin: spaced ? "8px 0 0" : 0, paddingLeft: 18 }}>
              {block.items.map((item, ii) => (
                <li key={ii} style={{ marginBottom: 3 }}>{renderInline(item, `ul${bi}-${ii}`)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={bi} style={{ ...spaced, margin: spaced ? "8px 0 0" : 0, paddingLeft: 18 }}>
              {block.items.map((item, ii) => (
                <li key={ii} style={{ marginBottom: 3 }}>{renderInline(item, `ol${bi}-${ii}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <div key={bi} style={spaced}>
            {block.lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `p${bi}-${li}`)}
              </Fragment>
            ))}
          </div>
        );
      })}
    </>
  );
}
