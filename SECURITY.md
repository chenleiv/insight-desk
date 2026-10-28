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

## Outbound requests

- **Fetching a user-supplied URL is guarded against SSRF.** `extractTextFromUrl` in `backend/textExtract.js`:
  - accepts only `http:` and `https:`;
  - resolves the host and rejects it if any address is loopback, private, link-local, shared (CGNAT), reserved,
    or multicast, including IPv4-mapped IPv6;
  - checks the address again when the socket connects (undici `Agent` with a guarded `lookup`), so DNS rebinding
    cannot swap in an internal address after the first check;
  - follows at most 3 redirects by hand and checks every hop;
  - stops after 10 seconds and rejects bodies over 5 MB, whether or not `Content-Length` is sent.
  Test: `backend/__tests__/extractTextFromUrl.test.js`.

## Data integrity

- **Chunk replacement is atomic.** `syncDocumentChunks` deletes a document's old chunks and inserts the new ones
  in one MongoDB transaction (Atlas runs as a replica set, which transactions require). If the insert fails
  midway, the delete is rolled back and the document keeps its old chunks.
  Test: `backend/rag/__tests__/syncChunks.integration.test.js`, against an in-memory replica set.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
