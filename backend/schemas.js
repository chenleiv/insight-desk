import { z } from 'zod';

// Auth Schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Document Schemas
export const documentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  category: z.string().min(1, 'Category is required').max(100),
  summary: z.string().min(1, 'Summary is required').max(2000),
  content: z.string().min(1, 'Content is required').max(500000),
});

// AI Schemas
export const aiChatSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  context: z.array(z.object({
    id: z.string().optional(),
    title: z.string(),
    content: z.string(),
  })).optional(),
});

// Import Bulk Schema
export const importBulkSchema = z.object({
  mode: z.enum(['append', 'replace']),
  documents: z.array(documentSchema),
});
