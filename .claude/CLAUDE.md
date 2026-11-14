# Insight Desk

A document workspace with RAG question answering over a document library, with cited sources.

---

## Project Context

Stack, rules, architecture:

Read `.claude/memory/context.md` before any implementation.

---

## Development Rules

Before coding, understand the affected files.

Prefer:

- minimal changes
- existing patterns
- production quality

Never:

- rewrite unrelated code
- change architecture silently
- remove security controls
- introduce unnecessary abstractions

---

## Commands

/feature — plan then build
/debug — root cause first
/review — feedback on changes
/ship — validate before commit
/cleanup — remove leftovers

- Run frontend: `npm run dev`
- Run server: `npm run dev:backend`
- test: `npm test`
- Build: `npm run build`
- Lint: `npm run lint`

Do not start dev servers; the owner starts them.

---

## Working rules

- Never read `backend/.env` and never ask for its contents.
- A failing test is a finding, not something to silence: fix the code, not the test.

---

## Product rules

- `DEFAULT_PROMPT` in `backend/prompts.js` is the only prompt defined in code. A prompt an admin saves in Settings overrides it until reset. Do not copy its wording elsewhere in the app.
- The product name in the UI and prompts is InsightDesk. The assistant is Dex.
- New code reaches the API through hooks. Known exceptions that call API clients directly: `AIAssistantView`, `AccountSection`, `AISection`, `UsersSection`, `DocumentPane`, `HubPage`, `LoginPage`. Providers in `src/auth/` and `src/context/` may call API clients.

---

## Done

A task is done only when all of these are true, checked in this order (the same order as CI):

- `npm run lint` reports no errors (ESLint covers TS/TSX only)
- `npm test` passes
- `npm run build` succeeds
- You gave the PR title and description (What, Why, Risks, Checks)
