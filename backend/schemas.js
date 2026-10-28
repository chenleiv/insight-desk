import { z } from 'zod';

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
  content: z.string().min(1, 'Content is required').max(500000),
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
