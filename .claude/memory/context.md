# Insight Desk — Context

Compact project context loaded by all agents.

---

## Paths

```
src/api/              API clients (TanStack Query hooks)
src/auth/             Auth logic and protected routes
src/components/       Shared UI components
src/context/          React context providers
src/hooks/            Custom hooks
src/pages/            Page components (hubPage, loginPage)
src/styles/           SCSS styles
src/utils/            Utilities
src/App.tsx           Root component + routing
backend/routes/       Express route handlers
backend/middleware/   Express middleware
backend/models.js     Mongoose/DB models
backend/schemas.js    Zod validation schemas
backend/ai.js         Groq AI integration
backend/auth.js       Auth logic
backend/prompts.js    AI prompt templates
backend/rag/          Search layer: chunking, embeddings, retrieval
backend/demo.js       Demo workspace lifecycle
backend/textExtract.js Document text extraction
.claude/memory/       Project context
.claude/skills/       Review skills
```

---

## Product

Insight Desk is a document workspace with a chat that answers from the user's documents and cites its sources.

Purpose:

Keep documents and their attachments in one place, and answer questions from the ones the user may read.

Core domains:

- Documents (create, edit, import, export, download as Markdown, PDF or Word; attachments in GridFS, parsed in a separate process)
- Search layer (backend/rag/: chunks each document and attachment, embeds chunks with a local model, scores them by cosine similarity in memory, scoped to documents the user may read)
- Chat (backend/ai.js: search results below a minimum score are dropped; with none left, a fixed "not found" answer skips the model; otherwise Groq answers from the chunks and citations are checked against them)
- Quality (retrieval logs and answer ratings, shown to admins and demo users)
- Auth (JWT HttpOnly cookie sessions; roles admin, viewer, demo; registration is closed)
- Demo (temporary private workspace with sample documents and daily limits)
- Hub (main workspace view)

---

## Stack

Frontend:

React 19
TypeScript
Vite
SCSS
TanStack Query v5 (server state)
React Context (client/UI state)
React Router v7

Backend:

Node.js
Express
JWT (HttpOnly cookies)
helmet, cors, express-rate-limit
Groq SDK (chat model)
@huggingface/transformers (local embeddings)
MongoDB GridFS (file storage)
Mongoose (MongoDB)
Zod (validation)
multer (file uploads)
mammoth, pdf-parse, xlsx (document parsing)

Testing:

Vitest + jsdom

---

## Frontend Rules

Use:

- feature-based folder structure under pages/
- TanStack Query for all server state (fetch, cache, mutations)
- React Context for UI/client state only
- custom hooks for reusable logic
- SCSS for component styles

Avoid:

- large components
- API calls inside components (use hooks)
- duplicated state (server state in context)
- prop drilling beyond 2 levels (use context)

---

## Backend Rules

Use:

route handler
↓
middleware
↓
service/model

Route handlers:

HTTP only, no business logic.

Services (ai.js, auth.js, textExtract.js):

Business logic only.

Avoid:

- business logic in route handlers
- leaking internal errors or stack traces

---

## Security Rules

Authentication:

JWT only inside HttpOnly cookies.

Never:

- localStorage tokens
- exposed secrets
- trusting frontend validation

Always check:

- auth middleware on protected routes
- input validation with Zod schemas
- file upload size and type limits
- AI response sanitization before rendering

---

## Development Rules

Before coding:

understand → plan → implement

Prefer:

- minimal changes
- existing patterns
- production quality

Avoid:

- unrelated refactors
- over engineering

---

## Engineering Priority

1. Security
2. Correctness
3. Maintainability
4. Performance

---

## TypeScript Rules

Prefer union types over string:

type DocumentStatus = 'uploading' | 'processing' | 'ready' | 'error'

Avoid: `any`, type assertions without reason, duplicated types.

Use strict typing. Handle nullable values safely.
