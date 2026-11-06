import type { DocumentItem } from "../../../api/documentsClient";

// Long enough for most titles, short enough to keep a card to two lines.
export const MAX_TITLE_LENGTH = 48;

// One wording per card, so the questions do not read as a list of the same sentence.
const TEMPLATES = [
  (title: string) => `What is “${title}” about?`,
  (title: string) => `What are the key points of “${title}”?`,
  (title: string) => `What are the most important rules in “${title}”?`,
  (title: string) => `What should I know first from “${title}”?`,
];

const time = (d: DocumentItem) => Date.parse(d.createdAt ?? d.updatedAt ?? "") || 0;

/** A title as it reads inside the question: one line, without its own outer quotes, and cut at a word. */
export function questionTitle(title: string): string {
  const flat = title.replace(/\s+/g, " ").trim().replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "").trim();
  if (flat.length <= MAX_TITLE_LENGTH) return flat;
  const cut = flat.slice(0, MAX_TITLE_LENGTH);
  // A word that ends right at the limit is kept whole.
  const lastSpace = /[\s.,;:!?-]/.test(flat[MAX_TITLE_LENGTH]) ? MAX_TITLE_LENGTH : cut.lastIndexOf(" ");
  return `${(lastSpace > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

/** Questions about the newest documents, one per document. */
export function documentQuestions(docs: DocumentItem[], count = TEMPLATES.length): string[] {
  const titles: string[] = [];
  for (const doc of [...docs].sort((a, b) => time(b) - time(a))) {
    const title = questionTitle(doc.title ?? "");
    if (title && !titles.includes(title)) titles.push(title);
    if (titles.length === Math.min(count, TEMPLATES.length)) break;
  }
  return titles.map((title, i) => TEMPLATES[i](title));
}
