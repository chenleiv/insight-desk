# Security

Security controls in Insight Desk and the tests that guard them.

## Accounts

- **No hard-coded accounts.** The server never creates fixed demo users such as `admin@demo.com`, in any environment.
  On an empty database it creates one admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, or no user at all.
  Test: `backend/__tests__/authHardening.test.js`, `backend/__tests__/seedUsers.test.js`.
- **Inactive accounts cannot sign in.** Password and Google login both reject a user whose status is `inactive`.
  The status is checked after the password, so it is revealed only to the account owner.
- **Google login checks an OAuth `state`.** `GET /api/auth/google` sends a random 256-bit state to Google and
  stores it in an HttpOnly, `SameSite=Lax` cookie scoped to `/api/auth/google` for 10 minutes. The callback
  compares it in constant time, clears the cookie whatever the outcome, and on a missing or wrong state
  redirects to `/login?error=google_state_mismatch` without exchanging the code. This blocks login CSRF.
  Test: `backend/__tests__/googleOAuthState.test.js`.

## Errors

- **Generic error responses.** `backend/middleware/errorHandler.js` is mounted last and turns any unhandled error
  into `{ detail: "Internal server error" }` (500) or a generic 4xx message. Messages, stack traces, and queries
  are logged on the server and never sent to the client.
  Test: `backend/middleware/__tests__/errorHandler.test.js`.
- **Chat errors** return a fixed message; the upstream model error stays in the server log.
  Test: `backend/__tests__/aiChat.test.js`.

## Input limits

| Input | Limit | On violation |
| --- | --- | --- |
| JSON request body | 2 MB (`JSON_BODY_LIMIT` in `backend/middleware/setup.js`) | 413 `Request body too large` |
| Chat message | 2000 characters (`aiChatSchema`) | 400, the model is not called |
| Search query | 500 characters | 400 |
| Document content | 500,000 characters | 400 |
| Bulk import | 50 documents | 400 |

Tests: `backend/middleware/__tests__/setup.test.js`, `backend/__tests__/aiChat.test.js`.

## Browser

- **The CSP allows no inline scripts.** `script-src` is `'self'` only, and `script-src-attr` is `'none'`
  (helmet's default), so an injected `<script>` or `onclick=` handler does not run. The theme script that used
  to be inline in `index.html` now lives in `public/theme-init.js` and still runs in `<head>`, before the first paint.
  Test: `backend/middleware/__tests__/setup.test.js` checks the header.
  Checked by hand: `dist/index.html` from `npm run build` has no inline `<script>`. Under the real middleware,
  headless Chromium renders the login page with the theme set, and an inline script on a probe page is blocked.
- **Known gap, accepted:** `style-src` still includes `'unsafe-inline'`, helmet's default, kept on purpose.
  Injected CSS cannot run code; at worst it restyles the page or, in rare cases, leaks a value from it.
  We have not checked whether removing it would break a dependency that injects `<style>` tags.

## Data integrity

- **Chunk replacement is atomic.** `syncDocumentChunks` deletes a document's old chunks and inserts the new ones
  in one MongoDB transaction (Atlas runs as a replica set, which transactions require). If the insert fails
  midway, the delete is rolled back and the document keeps its old chunks.
  Test: `backend/rag/__tests__/syncChunks.integration.test.js`, against an in-memory replica set.

## Considered and not built

- **Adding a document from a URL.** Evaluated and not shipped; the server does not fetch user-supplied URLs.
  - Risks: SSRF, the server fetching attacker-chosen addresses, including through redirects and DNS rebinding;
    and indirect prompt injection, untrusted page text entering the shared index and steering chat answers.
  - Mitigations that were designed: blocking private, loopback and metadata address ranges, re-checking every
    redirect, size and timeout limits, admin-only access, and human review of the text before it is indexed.
  - Why it was not shipped: demo accounts are open to anyone without a password, regular documents are shared by
    every admin and viewer, which widens the exposure of one poisoned page, and the benefit over importing a file
    is small.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
