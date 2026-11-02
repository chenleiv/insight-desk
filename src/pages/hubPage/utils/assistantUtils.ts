import type { ChatResponse } from "../../../api/aiClient";

export function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

/** The documents an answer cites, each once, in order of first citation. */
export function citedSources(citations: ChatResponse["citations"]) {
  return [...new Map(citations.map((c) => [c.docId, { id: c.docId, title: c.title }])).values()];
}

// One or more citations in a row, like [c1] or [c1, c2][c3]. The pattern starts at
// the bracket: a leading \s* would rescan each run of blanks from every position in it.
const CITATION_RUN = /\[\s*c\d+(?:\s*,\s*c\d+)*\s*\](?:\s*\[\s*c\d+(?:\s*,\s*c\d+)*\s*\])*/g;
const LIST_BULLET_ONLY = /^\s*(?:[-*+]|\d+[.)])$/;
const NO_BREAK_SPACE = " ";

/** A left-to-right isolate, so the number and its brackets do not flip in a right-to-left answer. */
function citationMarker(number: number) {
  return `⁦[${number}]⁩`;
}

/**
 * Show chunk citations like [c1, c2] as the numbers of the cited documents, each once.
 * A document's number is its position in citedSources, so markers match the numbered chips.
 */
export function formatCitations(answer: string, citations: ChatResponse["citations"]) {
  const docNumbers = new Map(citedSources(citations).map((s, i) => [s.id, i + 1]));
  const numbers = new Map(citations.map((c) => [c.id, docNumbers.get(c.docId) ?? 0]));

  let text = "";
  let copyFrom = 0;
  for (const match of answer.matchAll(CITATION_RUN)) {
    const cited = [...new Set((match[0].match(/c\d+/g) ?? []).flatMap((id) => numbers.get(id) ?? []))];
    const end = match.index + match[0].length;
    const head = text + answer.slice(copyFrom, match.index);
    const trimmed = head.trimEnd();
    copyFrom = end;
    // An unknown citation takes the whitespace in front of it along with it.
    if (!cited.length) {
      text = trimmed;
      continue;
    }
    const markers = cited.map(citationMarker).join(NO_BREAK_SPACE);
    const gap = head.slice(trimmed.length);
    const rest = answer.slice(end);
    const endsLine = /^[ \t]*(?:\r?\n|$)/.test(rest);
    const startsLineWithText = gap.includes("\n") && !endsLine;
    const afterBullet = LIST_BULLET_ONLY.test(trimmed.slice(trimmed.lastIndexOf("\n") + 1));
    // A marker alone on its line moves up to the text it cites. One that opens a line
    // of text, or follows a list bullet, stays there: moving it would change the Markdown.
    text = trimmed && !startsLineWithText && !afterBullet
      ? `${trimmed}${NO_BREAK_SPACE}${markers}`
      : `${head}${markers}`;
    if (/^[\p{L}\p{N}]/u.test(rest)) text += " ";
  }
  return text + answer.slice(copyFrom);
}

/** The time a message was sent, or null for a message saved without one. */
export function formatMessageTime(sentAt: number | undefined) {
  if (!Number.isFinite(sentAt)) return null;
  return new Date(sentAt as number).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
