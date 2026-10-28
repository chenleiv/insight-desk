# InsightDesk

An AI-powered document workspace for teams. Upload PDF, DOCX, and Excel files — Insight Desk extracts the text, organizes your knowledge base, and lets you chat with an AI assistant (powered by Groq) that can read and reason over your documents.

---

## ✨ Features

### 📄 Document Management
- **Create, edit, and categorize** documents with rich text content
- **File attachments** — attach PDF, DOCX, and Excel files; text is automatically extracted and indexed
- **Drag-to-resize sidebar** — resizable document panel with auto-collapse/expand behavior
- **Persistent ordering** — document order saved per user via localStorage
- **Favorites** — bookmark documents per user account
- **Import / Export** — backup and restore your knowledge base as JSON (with preview before import)
- **Safe deletions** — confirmation modal before destructive actions

### 🤖 AI Assistant ("Brainy")
- **Contextual chat** — select documents to inject as context for the AI
- **Attachment-aware** — AI can read the extracted text from attached PDF/DOCX/Excel files
- **Groq-powered** — uses `llama-3.1-8b-instant` via the Groq SDK for fast inference
- **Customizable system prompt** — admins can configure the AI's behavior from the Settings view
- **Example questions** — admins can set suggested prompts shown to users

### 👥 Users & Roles
- **Role-based access control** — `admin` and `viewer` roles
- **Admin panel** — manage users (create, activate/deactivate) at `/users`
- **JWT authentication** — secure httpOnly cookie-based sessions
- **Auto-seeding** — first-run seeds an admin user if the DB is empty

### 📱 Responsive UI
- **Desktop**: resizable document sidebar + main content area
- **Mobile**: bottom-bar navigation, slide-up document picker, hamburger drawer
- **Light / Dark theme** — system-aware with manual toggle
- **Status bar** — non-blocking feedback toasts for actions

---

## 🛠️ Tech Stack

### Frontend
| Tool | Version | Role |
|------|---------|------|
| **React** | 19 | UI framework — uses `useActionState`, lazy loading |
| **React Compiler** | `babel-plugin-react-compiler` | Automatic memoization |
| **TypeScript** | 5.9 | Type safety |
| **Vite** | 7.x | Dev server & build tool |
| **react-router-dom** | v7 | Client-side routing |
| **TanStack Query** | v5 | Server-state management, caching, background refetching |
| **SCSS** | — | Styling with CSS variables theming system |
| **lucide-react** | — | Icon library |
| **zod** | v4 | Runtime schema validation (shared with backend) |
| **Vitest** | v4 | Unit testing |

### Backend
| Tool | Version | Role |
|------|---------|------|
| **Node.js + Express** | — | API server |
| **MongoDB + Mongoose** | 9.x | Data persistence |
| **Groq SDK** | — | AI inference (`openai/gpt-oss-20b`) |
| **MongoDB GridFS** | — | File storage for attachments |
| **multer** | — | File upload handling |
| **pdf-parse** | — | PDF text extraction |
| **mammoth** | — | DOCX text extraction |
| **xlsx** | — | Excel text extraction |
| **jsonwebtoken + bcryptjs** | — | Auth (JWT + password hashing) |
| **helmet** | — | Security headers (CSP, HSTS, etc.) |
| **express-rate-limit** | — | Rate limiting (100 req/15min in production) |
| **compression** | — | Gzip response compression |
| **zod** | v4 | Request body validation |

---

## 📂 Project Structure

```
ai-workspace/
├── src/                            # Frontend (React + TypeScript)
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Router + layout shell
│   ├── auth/                       # AuthProvider, RequireAuth, RequireRole, useAuth
│   ├── api/                        # API clients (documents, auth, ai)
│   ├── context/                    # DocumentsContext (TanStack Query)
│   ├── components/
│   │   ├── confirmModal/           # Global confirm dialog system
│   │   ├── statusBar/              # Toast-style status messages
│   │   ├── header/                 # App header
│   │   ├── userMenu/               # User avatar menu
│   │   └── ...
│   ├── hooks/                      # useConfirm, useMobile, useResize, useTheme
│   ├── pages/
│   │   ├── loginPage/              # Login + admin Users page
│   │   └── hubPage/                # Main app
│   │       ├── HubPage.tsx         # Root layout + panel resize logic
│   │       ├── components/
│   │       │   ├── documents/      # DocPanel, DocumentPane, DocumentEdit, DocumentHeader
│   │       │   ├── views/          # AIAssistantView, DashboardView, QualityView, SettingsView
│   │       │   ├── dialogs/        # ImportPreviewDialog, EmptyPane, TourOverlay, WelcomeModal
│   │       │   └── layout/         # TopBar, MobileDrawer, DemoBanner, TypewriterText
│   │       ├── hooks/              # useDocumentAttachments, useDocumentAutosave,
│   │       │                       # useDocumentOrdering, useImportExport,
│   │       │                       # useQualitySummary, useUnsavedChangesGuard
│   │       └── utils/              # documentForm, ordering, parseImportFile,
│   │                               # assistantUtils, attachmentLink, categoryColorStore,
│   │                               # docs, hubView
│   ├── styles/                     # globals.scss, theme.scss, layout.scss
│   └── utils/                      # initials, relativeTime, storage
│
├── backend/                        # Backend (Node.js + Express)
│   ├── index.js                    # Server entry — Express setup, MongoDB connect
│   ├── auth.js                     # JWT middleware, login, Google OAuth, demo sign-in, user seeding
│   ├── access.js                   # Who may see and change which documents
│   ├── demo.js                     # Private demo workspaces and their cleanup
│   ├── ai.js                       # Groq chat, feedback, quality summary, system prompt, suggestions
│   ├── models.js                   # Mongoose models: User, Document, AIConfig, Chunk, RetrievalLog
│   ├── schemas.js                  # Zod validation schemas
│   ├── prompts.js                  # Default system prompt + metadata
│   ├── textExtract.js              # PDF / DOCX / Excel text extraction
│   ├── logger.js                   # Structured logger
│   ├── loadEnv.js                  # .env loader
│   ├── demo/                       # Demo sample documents and precomputed embeddings
│   ├── middleware/
│   │   ├── setup.js                # helmet, CORS, rate limiting, compression
│   │   └── errorHandler.js         # Central error handler
│   ├── rag/                        # Retrieval: chunking, embeddings, chunk sync,
│   │                               # semantic search, retrieval logs and stats
│   ├── routes/
│   │   ├── documents.js            # CRUD, attachments, import/export, text extraction
│   │   ├── users.js                # Admin user management
│   │   ├── search.js               # Semantic search over readable documents
│   │   └── health.js               # Health check
│   └── scripts/                    # reindex, embed:demo, eval:prod, one-off migrations
│
├── eval/                           # Retrieval eval (npm run eval) and its results
├── docs/                           # EVAL.md, AGENT_WORKFLOW.md
├── Procfile                        # Heroku-style start command
└── .claude/                        # Claude Code project configuration
    ├── CLAUDE.md                   # Project context for Claude
    ├── memory/context.md           # Stack, architecture, rules
    ├── agents/                     # Specialized review agents
    ├── commands/                   # Slash commands (feature, debug, ship, review, cleanup)
    ├── hooks/build-check.sh        # Auto-runs build + tests on Stop
    └── skills/                     # React, Express, security, testing review rules
```

---

## ⚙️ Setup

### Prerequisites
- Node.js 20+
- MongoDB instance (local or Atlas)
- Groq API key

> **MongoDB must run as a replica set.** The server uses MongoDB transactions (document chunk sync and bulk import), and transactions only work on a replica set. MongoDB Atlas always runs as a replica set, so it works out of the box. A local MongoDB must be started as a replica set; a single-node replica set is enough. A plain standalone instance (for example, a default Docker `mongo` container) will fail on import and on document edits.

### Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment** — create `backend/.env`:
   ```env
   MONGODB_URI=mongodb+srv://...
   JWT_SECRET=your-secret
   GROQ_API_KEY=gsk_...
   FRONTEND_URL=http://localhost:5173
   PORT=8000
   ```
   In production behind reverse proxies, also set `TRUST_PROXY_HOPS` to the number
   of proxies in front of the server. On Render this is `3` (Cloudflare, Render's
   load balancer, and Render's local proxy), measured from the `X-Forwarded-For`
   chain. This makes the rate limiter see each client's real IP; a value that is
   too high lets clients spoof their IP. Leave it unset locally.

3. **Start development servers**
   ```bash
   # Frontend (Vite dev server on :5173)
   npm run dev

   # Backend (Node with --watch on :8000)
   npm run dev:backend
   ```

4. **Run tests**
   ```bash
   npm test
   ```

### Embeddings

Every chunk gets an embedding when its document is saved. If embedding fails, the
chunks are saved without one and the server fills them in: once a minute after the
failure, and again on every start. No manual step is needed.

After changing the embedding model or the chunk settings (`CHUNK_SIZE`,
`CHUNK_OVERLAP` in `backend/rag/buildChunks.js`), rebuild everything against each
database:

```bash
npm run reindex -- --dry-run   # print the new chunk counts, write nothing
npm run reindex
npm run embed:demo   # regenerate the demo sample vectors, then commit them
```

`npm run reindex` uses `MONGODB_URI` from the environment, which takes precedence
over `backend/.env`. To rebuild production after the deploy, run it from the
Render service shell, or locally with the production connection string set:
`MONGODB_URI="<production connection string>" npm run reindex`.

---

## 🔑 API Routes

"Editor" means an admin, or a demo visitor inside their own demo workspace.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Login, returns JWT cookie |
| `POST` | `/api/auth/register` | — | Create an account |
| `POST` | `/api/auth/demo` | — | Start a private demo workspace |
| `GET` | `/api/auth/google` | — | Start Google sign-in (503 if not configured) |
| `GET` | `/api/auth/google/callback` | — | Google sign-in callback |
| `POST` | `/api/auth/logout` | — | Clear session |
| `GET` | `/api/auth/me` | ✓ | Current user |
| `PATCH` | `/api/auth/profile` | ✓ | Update display name and job title |
| `PATCH` | `/api/auth/password` | ✓ | Change password |
| `GET` | `/api/documents` | ✓ | List readable documents |
| `GET` | `/api/documents/:id` | ✓ | Get one document |
| `POST` | `/api/documents` | editor | Create document |
| `PUT` | `/api/documents/:id` | editor | Update document |
| `DELETE` | `/api/documents/:id` | editor | Delete document |
| `POST` | `/api/documents/:id/toggle-favorite` | ✓ | Add or remove a favorite |
| `GET` | `/api/documents/export` | editor | Export documents as JSON |
| `POST` | `/api/documents/import-bulk` | editor | Import documents (append or replace) |
| `POST` | `/api/documents/extract-text` | editor | Extract text from an uploaded file |
| `POST` | `/api/documents/:id/attachments` | editor | Upload file attachment |
| `GET` | `/api/documents/:id/attachments/:attId/file` | ✓ | Download attachment |
| `DELETE` | `/api/documents/:id/attachments/:attId` | editor | Remove attachment |
| `GET` | `/api/search` | ✓ | Semantic search over readable documents |
| `POST` | `/api/ai/chat` | ✓ | AI chat with document context |
| `POST` | `/api/ai/feedback` | ✓ | Rate a chat answer |
| `GET` | `/api/ai/quality` | admin, demo | Answer-quality summary |
| `GET` | `/api/ai/prompt` | ✓ | Get current system prompt |
| `PATCH` | `/api/ai/prompt` | admin | Update system prompt |
| `GET` | `/api/ai/suggestions` | ✓ | Get example questions |
| `PATCH` | `/api/ai/suggestions` | admin | Update example questions |
| `GET` | `/api/users` | admin | List users (demo visitors get sample users) |
| `PATCH` | `/api/users/:id` | admin | Update user |
| `DELETE` | `/api/users/:id` | admin | Delete user |
| `GET` | `/health` | — | Health check |

---

## 🧑‍💻 Development Workflow

This project uses [Claude Code](https://claude.ai/code) with project-level slash commands:

| Command | Description |
|---------|-------------|
| `/feature <description>` | Plan then build — always shows a plan before editing |
| `/debug [issue]` | Root cause analysis before any fix |
| `/review` | Code review of current changes |
| `/ship` | Full validation (build, lint, tests, security) before committing |
| `/cleanup` | Remove debug leftovers in changed files only |

A build + test hook runs automatically after each Claude session.

---

## 🗺️ Roadmap

- [x] React 19 + React Compiler
- [x] TanStack Query v5 for server state
- [x] Groq AI integration (openai/gpt-oss-20b)
- [x] File attachments with PDF/DOCX/Excel text extraction
- [x] Role-based access control (admin / viewer)
- [x] Resizable sidebar with auto-collapse
- [x] Mobile-first responsive layout
- [x] Customizable AI system prompt + example questions
- [x] Vitest unit tests
- [x] React Compiler lint compliance (`react-hooks/set-state-in-effect`, `react-hooks/refs`)
- [x] Vector embeddings & semantic search (RAG)
- [x] Retrieval eval and answer-quality dashboard
- [ ] Real-time collaboration
