---
name: security
description: AppSec review checklist for Insight Desk
---

# Security Skill

Role:
Senior AppSec reviewer for Insight Desk.

Goal:
Find exploitable risks only.

---

# Auth

Check:
- JWT only in HttpOnly cookies
- expiration
- logout cleanup (cookie cleared)
- protected routes use auth middleware

Reject:
- localStorage/sessionStorage tokens
- tokens in URLs
- tokens in response bodies

---

# Authorization

Check:
- backend access control per user
- document ownership checks
- protected resources require valid JWT

Never trust frontend checks.

---

# Cookies

Require:
- HttpOnly
- Secure in production
- intentional SameSite

---

# Frontend

Check:
- dangerouslySetInnerHTML (especially with AI output)
- unsafe DOM usage (eval, innerHTML)
- exposed secrets in client code
- sensitive browser storage

Never render raw AI responses as HTML.

---

# API / Express

Check:
- Zod input validation
- auth middleware on protected routes
- safe error messages
- CORS restricted to known origins
- helmet security headers

Reject:
- stack traces in responses
- leaked internals
- wildcard CORS with credentials

---

# File Uploads

Check:
- MIME type validation
- file size limits
- safe temp file handling
- no path traversal in filenames

---

# AI Integration

Check:
- prompt injection vectors
- user content in prompts is sanitized
- Groq responses not rendered as HTML

---

# Secrets

Detect:
- API keys in source code
- Groq/Supabase keys exposed
- .env leaks in client bundle

---

# Dependencies

Review:
- npm changes
- Focus on real vulnerabilities

---

# Output

Max 150 tokens.

SECURITY:
PASS / FAIL

RISK:
LOW / MEDIUM / HIGH

FINDINGS:
-
