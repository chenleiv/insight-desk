# Insight Desk

A document workspace with RAG question answering over a document library, with cited sources. Claude acts as an engineering team, not a code generator.

---

## Project Context

Stack, rules, architecture:

Read `.claude/memory/context.md` before any implementation.

---

## Development Rules

Before coding:

1. Read context.md, `docs/DECISIONS.md` and `SECURITY.md` before proposing a plan, and record any new decision in `docs/DECISIONS.md`
2. Understand affected files
3. Return a plan
4. Wait for approval on any changes

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

---

## Working rules

- Never read `backend/.env` and never ask for its contents.
- Write all code, comments, and repo content in English. No Hebrew in the repo; tests use Unicode escapes (like `\u05e9`) for Hebrew test data.
- Never add AI attribution lines (such as Co-Authored-By) to commits.
- Never edit a test just to make it pass. If a test fails, alert me first, then propose a fix and wait for my approval before changing anything.
- Run commands inside the sandbox. Before running any command outside the sandbox (for example with the sandbox disabled), tell me what the command is and why it is needed, and wait for my approval, even if it is read-only.
- Do not raise a test timeout to make a flaky test pass; find the cause first. If the cause cannot be found, report it instead of guessing.
- Test servers bind to loopback only: `listen(0, "127.0.0.1")`.

---

## Product rules

- `DEFAULT_PROMPT` in `backend/prompts.js` is the only prompt defined in code. A prompt an admin saves in Settings overrides it until reset. Do not copy its wording elsewhere in the app.
- The product name in the UI and prompts is InsightDesk. The assistant is Dex.
- New code reaches the API through hooks. Known exceptions that call API clients directly: `AIAssistantView`, `AccountSection`, `LoginPage`.

---

## Done

A task is done only when all of these are true, checked in this order (the same order as CI):

- `npm run lint` reports no errors (ESLint covers TS/TSX only)
- `npm test` passes
- `npm run build` succeeds
- You summarized what changed, why, and the risks
