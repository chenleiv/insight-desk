import { DEMO_MAX_UPLOAD_BYTES } from "../../shared/uploadRules";

// Mirrors DEMO_LIMITS in backend/access.js; the server enforces them.
export const DEMO_LIMITS = {
  documents: 20,
  contentLength: 20000,
  attachmentsPerDocument: 1,
  uploadBytes: DEMO_MAX_UPLOAD_BYTES,
  storageBytes: 5 * 1024 * 1024,
} as const;
