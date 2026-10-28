// Mirrors DEMO_LIMITS in backend/access.js; the server enforces them.
export const DEMO_LIMITS = {
  documents: 20,
  contentLength: 20000,
  attachmentsPerDocument: 1,
} as const;
