import { Fragment, type ReactNode } from "react";

/*
 * A small Markdown renderer for model answers, which are untrusted.
 *
 * It builds React elements only, so nothing it outputs is parsed as HTML.
 * It knows bold, italic, inline code, flat lists and fenced code blocks.
 * Links, images and HTML are not supported and stay plain text, so a citation
 * shown as "[1]", or as "[Document Title]" in an older saved answer, is never
 * turned into a link.
 *
 * Every step is a single pass or a lookup in a table built in one pass, and
 * no regular expression is used on the text, so time stays linear in its length.
 * An unclosed marker, e.g. while the answer is still being typed, stays plain text.
 */

type ListItem = { ordered: boolean; start: number; text: string };

type Block =
  | { kind: "text"; lines: string[] }
  | { kind: "code"; lines: string[] }
  | { kind: "list"; ordered: boolean; start: number; items: string[] };

function isSpace(ch: string | undefined) {
  return ch === undefined || ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isFence(line: string) {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  return line.startsWith("```", i);
}

/** "- item", "* item", "+ item", "1. item" or "1) item"; null for any other line. */
function parseListItem(line: string): ListItem | null {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  let ordered = false;
  let start = 1;
  if (line[i] === "-" || line[i] === "*" || line[i] === "+") {
    i++;
  } else {
    let j = i;
    while (j < line.length && j - i < 9 && line[j] >= "0" && line[j] <= "9") j++;
    if (j === i || (line[j] !== "." && line[j] !== ")")) return null;
    ordered = true;
    start = Number(line.slice(i, j));
    i = j + 1;
  }
  if (line[i] !== " " && line[i] !== "\t") return null;
  return { ordered, start, text: line.slice(i + 1).trim() };
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  const pushText = (line: string) => {
    const last = blocks.at(-1);
    if (last?.kind === "text") last.lines.push(line);
    else blocks.push({ kind: "text", lines: [line] });
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isFence(line)) {
      let end = i + 1;
      while (end < lines.length && !isFence(lines[end])) end++;
      if (end < lines.length) {
        blocks.push({ kind: "code", lines: lines.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
      // Unclosed: there is no fence after this line either, so the rest is scanned once.
      pushText(line);
      i++;
      continue;
    }
    const item = parseListItem(line);
    if (item) {
      const last = blocks.at(-1);
      if (last?.kind === "list" && last.ordered === item.ordered) last.items.push(item.text);
      else blocks.push({ kind: "list", ordered: item.ordered, start: item.start, items: [item.text] });
      i++;
      continue;
    }
    pushText(line);
    i++;
  }
  return blocks;
}

/**
 * For each index, the nearest index at or after it where `isCloser` holds,
 * or -1. Built right to left in one pass, so finding a closer is a lookup.
 */
function closers(line: string, isCloser: (i: number) => boolean) {
  const next = new Int32Array(line.length + 1).fill(-1);
  for (let i = line.length - 1; i >= 1; i--) next[i] = isCloser(i) ? i : next[i + 1];
  return next;
}

/** Inline code, bold and italic in one line. Bold content may hold italic and code. */
function renderInline(line: string, allowBold = true): ReactNode {
  const tick = closers(line, (i) => line[i] === "`");
  const bold = allowBold
    ? closers(line, (i) => line.startsWith("**", i) && !isSpace(line[i - 1]))
    : null;
  const em = closers(
    line,
    (i) => line[i] === "*" && line[i - 1] !== "*" && line[i + 1] !== "*" && !isSpace(line[i - 1])
  );

  const nodes: ReactNode[] = [];
  let plainFrom = 0;
  let i = 0;
  const open = (start: number, end: number, node: ReactNode) => {
    if (start > plainFrom) nodes.push(line.slice(plainFrom, start));
    nodes.push(node);
    i = plainFrom = end;
  };

  while (i < line.length) {
    if (line[i] === "`") {
      const end = tick[i + 1];
      if (end > i + 1) {
        open(i, end + 1, <code key={i}>{line.slice(i + 1, end)}</code>);
        continue;
      }
    } else if (bold && line.startsWith("**", i) && !isSpace(line[i + 2])) {
      const end = bold[i + 2];
      if (end > i + 2) {
        open(i, end + 2, <strong key={i}>{renderInline(line.slice(i + 2, end), false)}</strong>);
        continue;
      }
    } else if (line[i] === "*" && line[i + 1] !== "*" && !isSpace(line[i + 1])) {
      const end = em[i + 1];
      if (end > i + 1) {
        open(i, end + 1, <em key={i}>{line.slice(i + 1, end)}</em>);
        continue;
      }
    }
    i++;
  }

  if (!nodes.length) return line;
  if (plainFrom < line.length) nodes.push(line.slice(plainFrom));
  return nodes;
}

/** Lines of text joined by newlines; the original string when there is no markup. */
function renderLines(lines: string[]): ReactNode {
  const rendered = lines.map((line) => renderInline(line));
  if (rendered.every((node) => typeof node === "string")) return lines.join("\n");
  return rendered.map((node, i) => (
    <Fragment key={i}>
      {i > 0 && "\n"}
      {node}
    </Fragment>
  ));
}

function trimBlankLines(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end);
}

export function renderMarkdown(text: string): ReactNode {
  const blocks = parseBlocks(text);
  // Plain text stays exactly as it was, including its blank lines.
  if (blocks.length === 1 && blocks[0].kind === "text") return renderLines(blocks[0].lines);

  return blocks.map((block, i) => {
    if (block.kind === "code") {
      return (
        <pre key={i}>
          <code>{block.lines.join("\n")}</code>
        </pre>
      );
    }
    if (block.kind === "list") {
      const items = block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
      return block.ordered
        ? <ol key={i} start={block.start}>{items}</ol>
        : <ul key={i}>{items}</ul>;
    }
    // The block elements around it already start on a new line.
    const lines = trimBlankLines(block.lines);
    return lines.length ? <Fragment key={i}>{renderLines(lines)}</Fragment> : null;
  });
}
