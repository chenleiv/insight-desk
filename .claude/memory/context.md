# Insight Desk — Context

Compact project context loaded by all agents.

---

## Paths

```
src/api/              API clients (plain fetch; TanStack Query hooks live in page hooks and providers)
src/auth/             Auth logic and protected routes
src/components/       Shared UI components
src/context/          React context providers
src/hooks/            Custom hooks
src/pages/            Page components (hubPage, loginPage)
src/styles/           SCSS styles
src/utils/            Utilities
src/App.tsx           Root component + routing
backend/index.js      Server entry point
backend/app.js        Express app: middleware and route mounting
backend/routes/       Express route handlers
backend/middleware/   Express middleware
backend/models.js     Mongoose/DB models
backend/schemas.js    Zod validation schemas
backend/access.js     Who may see and change which documents; demo limits
backend/ai.js         Chat router and Groq integration
backend/auth.js       Auth router and logic
backend/prompts.js    DEFAULT_PROMPT and the answer rules
backend/rag/          Search layer: chunking, embeddings, retrieval
backend/demo.js       Demo workspace lifecycle
backend/demoQuota.js  Demo limit counters
backend/usageBudget.js Daily limits on the chat's model use
backend/textExtract.js Document text extraction
backend/extractWorker.js Child process that parses one uploaded file
backend/fileSignature.js Checks a file's first bytes match its type
backend/zipGuard.js   Checks a ZIP's real size before parsing
backend/scripts/      Maintenance scripts (reindex, embedDemo, evalProd, normalizeEmails)
shared/               Upload rules used by frontend and backend
eval/                 Retrieval and answer evaluation
docs/                 EVAL.md and AGENT_WORKFLOW.md
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
- Auth (JWT HttpOnly cookie sessions; password or Google login; roles admin, viewer, demo; registration is closed, accounts come from the seed or an existing Google login)
- Demo (temporary private workspace with sample documents and daily limits)
- Hub (main workspace view)

---

## Stack

Frontend:

React 19
React Compiler (handles memoization)
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
docx, pdfkit (document export)

Testing:

Vitest + jsdom (default environment)
mongodb-memory-server (integration tests)

Test layout:

- tests live in __tests__ folders next to the code
- *.integration.test.js files run against an in-memory MongoDB started through backend/__tests__/mongoMemory.js
- backend tests set the `@vitest-environment node` pragma
- test servers bind to loopback only: listen(0, "127.0.0.1")
- Hebrew test data uses Unicode escapes (like ש)

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
- API calls inside components (use hooks; known exceptions are listed in .claude/CLAUDE.md)
- duplicated state (server state in context)
- prop drilling beyond 2 levels (use context)

---

## Backend Rules

Request flow:

middleware
↓
route handler (backend/routes/, or the routers in ai.js and auth.js)
↓
logic module/model

ai.js and auth.js each export an Express router and hold its logic together.

Put new non-HTTP logic in its own module with no req/res handling, like textExtract.js, demoQuota.js, usageBudget.js and backend/rag/.

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

Prefer union types over string.

Avoid: `any`, type assertions without reason, duplicated types.

Use strict typing. Handle nullable values safely.
