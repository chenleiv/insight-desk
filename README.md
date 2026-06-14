# InsightDesk

A full-stack knowledge management app for teams — organize documents, attach files, and query your knowledge base with an AI assistant powered by Groq.

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
| **Groq SDK** | — | AI inference (`llama-3.1-8b-instant`) |
| **Supabase** | — | File storage for attachments |
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
│   │       │   ├── views/          # AIAssistantView, DashboardView, SettingsView
│   │       │   ├── dialogs/        # ImportPreviewDialog, EmptyPane
│   │       │   └── layout/         # TopBar, MobileDrawer, TypewriterText
│   │       ├── hooks/              # useDocumentAttachments, useDocumentAutosave,
│   │       │                       # useDocumentOrdering, useImportExport
│   │       └── utils/              # documentForm, ordering, parseImportFile,
│   │                               # assistantUtils, categoryColorStore
│   └── styles/                     # globals.scss, theme.scss, layout.scss
│
├── backend/                        # Backend (Node.js + Express)
│   ├── index.js                    # Server entry — Express setup, MongoDB connect
│   ├── auth.js                     # JWT middleware, login/logout routes, user seeding
│   ├── ai.js                       # Groq chat, system prompt CRUD, suggestions
│   ├── models.js                   # Mongoose models: User, Document, AIConfig
│   ├── schemas.js                  # Zod validation schemas
│   ├── prompts.js                  # Default system prompt + metadata
│   ├── textExtract.js              # PDF / DOCX / Excel text extraction
│   ├── logger.js                   # Structured logger
│   ├── loadEnv.js                  # .env loader
│   ├── middleware/
│   │   └── setup.js                # helmet, CORS, rate limiting, compression
│   └── routes/
│       ├── documents.js            # CRUD + attachment upload/delete
│       └── users.js                # Admin user management
│
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
- Supabase project (for file storage)

### Quick Start

1. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install
   ```

2. **Configure environment** — create `backend/.env`:
   ```env
   MONGODB_URI=mongodb+srv://...
   JWT_SECRET=your-secret
   GROQ_API_KEY=gsk_...
   SUPABASE_URL=https://...
   SUPABASE_SERVICE_ROLE_KEY=...
   FRONTEND_URL=http://localhost:5173
   PORT=8000
   ```

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

---

## 🔑 API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Login, returns JWT cookie |
| `POST` | `/api/auth/logout` | ✓ | Clear session |
| `GET` | `/api/documents` | ✓ | List all documents |
| `POST` | `/api/documents` | admin | Create document |
| `PATCH` | `/api/documents/:id` | admin | Update document |
| `DELETE` | `/api/documents/:id` | admin | Delete document |
| `POST` | `/api/documents/:id/attachments` | admin | Upload file attachment |
| `DELETE` | `/api/documents/:id/attachments/:attId` | admin | Remove attachment |
| `POST` | `/api/ai/chat` | ✓ | AI chat with document context |
| `GET` | `/api/ai/prompt` | ✓ | Get current system prompt |
| `PATCH` | `/api/ai/prompt` | admin | Update system prompt |
| `GET` | `/api/ai/suggestions` | ✓ | Get example questions |
| `PATCH` | `/api/ai/suggestions` | admin | Update example questions |
| `GET` | `/api/users` | admin | List users |
| `POST` | `/api/users` | admin | Create user |
| `PATCH` | `/api/users/:id` | admin | Update user |
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
- [x] Groq AI integration (llama-3.1-8b-instant)
- [x] File attachments with PDF/DOCX/Excel text extraction
- [x] Role-based access control (admin / viewer)
- [x] Resizable sidebar with auto-collapse
- [x] Mobile-first responsive layout
- [x] Customizable AI system prompt + example questions
- [x] Vitest unit tests
- [x] React Compiler lint compliance (`react-hooks/set-state-in-effect`, `react-hooks/refs`)
- [ ] Vector embeddings & semantic search (RAG)
- [ ] Real-time collaboration
