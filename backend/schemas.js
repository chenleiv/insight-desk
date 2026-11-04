import { z } from 'zod';

// Sends a 400 with each issue's path and message only. Zod 4 keeps the list on
// `issues`, and other issue fields (such as the input, when reported) never reach the client.
export function sendValidationError(res, zodError) {
  res.status(400).json({
    detail: 'Validation failed',
    errors: zodError.issues.map(({ path, message }) => ({ path, message })),
  });
}

// One spelling per address, so case can neither split nor hide an account.
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

const emailField = z.string().trim().toLowerCase().email('Invalid email format').max(254);

// Far above any real password: bcrypt reads only 72 bytes, so this only stops absurd input.
const MAX_SUBMITTED_PASSWORD_LENGTH = 1024;

// Auth Schemas
export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(6, 'Password must be at least 6 characters').max(MAX_SUBMITTED_PASSWORD_LENGTH),
});

// Length only, no composition rules. bcrypt ignores everything past 72 bytes,
// so a longer password would look stronger than it is.
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(MAX_SUBMITTED_PASSWORD_LENGTH),
  newPassword: z.string()
    .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, `New password must be at most ${MAX_PASSWORD_BYTES} bytes`),
});

// Only the two editable fields; a value over the limit is refused rather than cut.
export const profileSchema = z.strictObject({
  displayName: z.string().trim().max(80).optional(),
  jobTitle: z.string().trim().max(80).optional(),
});

// A MongoDB ObjectId, so a malformed id is a 400 instead of a cast error.
const objectIdField = (label) => z.string().regex(/^[0-9a-f]{24}$/i, `Invalid ${label} id`);

// Document Schemas
export const documentParamsSchema = z.object({
  id: objectIdField('document'),
  attachmentId: objectIdField('attachment').optional(),
});

export const documentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  category: z.string().min(1, 'Category is required').max(100),
  content: z.string().min(1, 'Content is required').max(500000, 'Content must be at most 500,000 characters'),
});

// File type for downloading one document (query string)
export const documentDownloadQuerySchema = z.object({
  format: z.enum(['md', 'pdf', 'docx']),
});

// AI Schemas
// Only the question: the server finds the context itself, so any other field is rejected.
export const aiChatSchema = z.strictObject({
  message: z.string().trim().min(1, 'Message is required').max(2000),
});

// A rating only, never free text, so feedback cannot hold user content.
export const aiFeedbackSchema = z.strictObject({
  answerId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid answer id'),
  rating: z.enum(['up', 'down']),
});

// Admin settings for the chat. Empty suggestions are dropped by the route, as they always were.
export const aiPromptSchema = z.strictObject({
  prompt: z.string().trim().min(1, 'Prompt is required').max(20000),
});

export const aiSuggestionsSchema = z.strictObject({
  questions: z.array(z.string().trim().max(300)).max(20),
});

// User Schemas
export const userIdParamSchema = z.object({
  id: objectIdField('user'),
});

// Admins change only role and status; any other field is rejected.
export const userUpdateSchema = z
  .strictObject({
    role: z.enum(['admin', 'viewer']).optional(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: 'Provide role or status',
  });

// Quality dashboard range: the last 7 or 30 days (query string values arrive as strings).
export const qualityQuerySchema = z.object({
  days: z.enum(['7', '30']).transform(Number),
});

// Import Bulk Schema
// Every imported chunk is embedded on the CPU, so one request is capped.
const MAX_IMPORT_DOCUMENTS = 50;
export const importBulkSchema = z.object({
  mode: z.enum(['append', 'replace']),
  documents: z.array(documentSchema).max(MAX_IMPORT_DOCUMENTS),
});
