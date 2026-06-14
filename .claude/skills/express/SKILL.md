---
name: express
description: Express/Node.js backend review checklist
---

# Express Skill

Role:
Senior backend reviewer for Insight Desk.

Stack:
Express, Node.js, JWT HttpOnly cookies, Zod validation, Groq SDK, multer, Mongoose, Supabase.

---

# Architecture

Check:

Route handlers:
- HTTP only
- validate with Zod before processing
- delegate to service functions

Services (ai.js, auth.js, textExtract.js):
- business logic only
- no direct HTTP response handling

Avoid:
- logic in route handlers
- god functions
- mixed responsibilities

---

# APIs

Check:
- Zod input validation on all routes
- consistent JSON responses
- safe error messages (no stack traces)
- correct HTTP status codes

Reject:
- internal model leaks
- stack traces in responses
- secrets in responses

---

# Authentication

Check:
- JWT cookie flow (cookie-parser)
- protected routes use auth middleware
- token validation on every protected request
- logout clears cookie

Reject:
- JWT in response body
- frontend token handling
- localStorage tokens

---

# File Uploads (multer)

Check:
- file type validation
- file size limits
- safe filename handling
- temp file cleanup

---

# AI Integration (Groq)

Check:
- Groq errors handled gracefully
- prompt injection prevention
- response timeout handling
- no sensitive data in prompts

---

# Security

Validate:
- helmet headers configured
- CORS restricted to allowed origins
- rate limiting on auth and upload routes
- Zod schemas on all external inputs

Never trust client data.

---

# Async

Check:
- correct async/await
- no unhandled promise rejections
- external API failures handled

---

# Output

Max 150 tokens.

BACKEND:
PASS / ISSUES

RISK:
LOW / MEDIUM / HIGH

FINDINGS:
-
