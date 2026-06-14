---
description: Smart feature workflow
argument-hint: "[feature description]"
---

# Feature Workflow

Build production features safely.

Never code before planning.

---

# Input

Feature:

$ARGUMENTS

If missing:
ask for requirements.

---

# Analyze

Run:

context-analyzer

Detect:

- frontend
- backend
- database
- security
- AI integration impact

---

# Route

Use only required agents:

Frontend:
frontend-architect

Backend:
backend-architect

Database:
database-reviewer

Security:
security-auditor

Do not run unnecessary agents.

---

# Plan First

Before editing return:

PLAN:

Goal:
-

Files:
-

Changes:
-

Risks:
-

Validation:
-


Wait for approval.

---

# Implement

After approval:

Rules:

- minimal changes
- follow .claude/memory/context.md
- preserve architecture
- no unrelated refactors

---

# After Implementation

Run validation for changed areas.

Frontend changes:

Run:
npm run build

Fix build errors before marking COMPLETE.

Never return COMPLETE with failing build.

# Finish

Recommend:

/ship

---

# Output

Max 200 tokens.

FEATURE:
PLANNED / COMPLETE

SUMMARY:
-

NEXT:
-
