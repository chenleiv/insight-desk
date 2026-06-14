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

- critical flows (auth, document upload, AI analysis)
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
- user behavior (React Testing Library / Vitest)
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

---

# Security Tests

Verify:

- protected routes reject unauthenticated requests
- invalid auth fails
- bad input rejected by Zod

---

# Commands

Run available:

- npm run lint
- npm run typecheck
- npm run test
- npm run build

---

# Pass Criteria

Require:

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
