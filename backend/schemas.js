import { z } from 'zod';

// Sends a 400 with each issue's path and message only. Zod 4 keeps the list on
// `issues`, and other issue fields (such as the input, when reported) never reach the client.
export function sendValidationError(res, zodError) {
  res.status(400).json({
    detail: 'Validation failed',
    errors: zodError.issues.map(({ path, message }) => ({ path, message })),
  });
}

// Auth Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().max(80).optional(),
});

// Document Schemas
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

// Quality dashboard range: the last 7 or 30 days (query string values arrive as strings).
export const qualityQuerySchema = z.object({
  days: z.enum(['7', '30']).transform(Number),
});

// Search Schema (query string values arrive as strings)
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query is required').max(500),
  k: z.coerce.number().int().min(1).max(20).optional(),
});

// Import Bulk Schema
// Every imported chunk is embedded on the CPU, so one request is capped.
export const MAX_IMPORT_DOCUMENTS = 50;
export const importBulkSchema = z.object({
  mode: z.enum(['append', 'replace']),
  documents: z.array(documentSchema).max(MAX_IMPORT_DOCUMENTS),
});
