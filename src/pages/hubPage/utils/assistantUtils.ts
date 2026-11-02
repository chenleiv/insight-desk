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

/** Remove chunk citations like [c1, c2] from an answer; the source chips show what it cites. */
export function removeCitations(answer: string) {
  let text = "";
  let copyFrom = 0;
  for (const match of answer.matchAll(CITATION_RUN)) {
    const end = match.index + match[0].length;
    const head = text + answer.slice(copyFrom, match.index);
    const trimmed = head.trimEnd();
    const rest = answer.slice(end);
    const spaces = rest.length - rest.replace(/^[ \t]+/, "").length;
    const next = rest.charAt(spaces);
    const endsLine = next === "" || next === "\n" || next === "\r";
    const opensLine = !trimmed || head.slice(trimmed.length).includes("\n");
    copyFrom = end;
    if (opensLine && !endsLine) {
      // The text after it opens the line now, so the line break in front stays.
      text = head;
      copyFrom = end + spaces;
      continue;
    }
    // A citation takes the whitespace in front of it along with it.
    text = trimmed;
    if (endsLine || /[.,;:!?)]/.test(next)) copyFrom = end + spaces;
    else if (spaces === 0 && /^[\p{L}\p{N}]/u.test(rest)) text += " ";
  }
  return (text + answer.slice(copyFrom)).trim();
}

/** The time a message was sent, or null for a message saved without one. */
export function formatMessageTime(sentAt: number | undefined) {
  if (!Number.isFinite(sentAt)) return null;
  return new Date(sentAt as number).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
