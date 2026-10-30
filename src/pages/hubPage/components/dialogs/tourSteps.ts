import type { TourStep } from "./TourOverlay";

export const HUB_TOUR_STEPS: TourStep[] = [
  {
    selector: ".doc-panel-wrapper",
    title: "📄 Document list",
    description:
      "All your documents live here. Click any document to open it.\n\n⭐ Star — mark as favourite",
    placement: "right",
  },
  {
    selector: ".hub-main",
    title: "🧠 Brainy AI",
    description:
      "Ask Brainy anything about your documents — summaries, Q&A, comparisons. It finds the relevant documents for you.",
    placement: "left",
  },
  {
    selector: ".topbar-nav",
    title: "Navigation",
    description:
      "Dashboard — an overview of all your documents.\n\nSettings — theme, account details, and team members.",
    placement: "bottom",
  },
];

export const DOC_TOUR_STEPS: TourStep[] = [
  {
    selector: ".doc-pane-edit-btn",
    title: "✏️ Edit",
    description:
      "Documents open read-only. Click Edit to make changes, then Save or Cancel.",
    placement: "bottom",
  },
  {
    selector: ".notion-att-chips",
    title: "📎 Attachments",
    description:
      "Attach files here — PDF, Word, Excel. The text is extracted automatically so Brainy AI can read them.",
    placement: "left",
  },
];

export const NEW_DOC_TOUR_STEPS: TourStep[] = [
  {
    selector: ".notion-content-input",
    title: "✏️ Start writing",
    description: "Type your content here.",
    placement: "left",
  },
  {
    selector: ".doc-pane-import-btn",
    title: "Import text from file",
    description:
      "Click here to extract text from a PDF, Word, or Excel file and paste it straight into the document.",
    placement: "bottom",
  },
  {
    selector: ".notion-att-chip--add",
    title: "📎 Add file",
    description:
      "Attach a raw file to this document. Brainy AI will be able to read its contents.",
    placement: "right",
  },
];
