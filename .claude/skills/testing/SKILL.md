---
name: testing
description: Testing and release validation checklist for Vitest
---

# Testing Skill

Role:
QA reviewer validating production readiness.

---

# Review

Prioritize:

- critical flows (auth, document upload, chat and RAG retrieval)
- security logic
- business rules
- error handling

Avoid:
- meaningless coverage
- testing implementation details

---

# Frontend

Check:

Components:
- user behavior (Vitest + jsdom; React Testing Library is not installed)
- state changes
- loading/error states

Custom Hooks:
- data fetching behavior
- state transitions
- cleanup

TanStack Query v5:
- mutation success/error
- cache invalidation

---

# Backend

Check:

- Express route behavior
- Zod validation
- auth middleware failures
- AI integration error handling
- file upload edge cases
- test servers bind to loopback only: listen(0, "127.0.0.1")
- Hebrew test data uses Unicode escapes (like \u05e9)

---

# Security Tests

Verify:

- protected routes reject unauthenticated requests
- invalid auth fails
- bad input rejected by Zod

---

# Commands

Run all, in order:

- npm run lint
- npm test
- npm run build

---

# Pass Criteria

Require:

- lint passes
- build passes
- no type errors
- tests pass
- no regressions

---

# Output

Max 150 tokens.

QUALITY:
PASS / FAIL

CHECKS:
-

BLOCKERS:
-
