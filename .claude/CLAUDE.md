# Insight Desk

AI-powered document analysis and insights workspace. Claude acts as an engineering team, not a code generator.

---

## Project Context

Stack, rules, architecture:

Read `.claude/memory/context.md` before any implementation.

---

## Development Rules

Before coding:

1. Read context.md
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
- Write all code, comments, and repo content in English.
- Never edit a test just to make it pass. If a test fails, alert me first, then propose a fix and wait for my approval before changing anything.

---

## Done

A task is done only when all of these are true:

- `npm test` passes
- `npm run lint` reports no errors
- `npm run build` succeeds
- You summarized what changed, why, and the risks
