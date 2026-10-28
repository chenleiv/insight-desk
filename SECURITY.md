# Security

Security controls in Insight Desk and the tests that guard them.

## Accounts

- **No hard-coded accounts.** The server never creates fixed demo users such as `admin@demo.com`, in any environment.
  On an empty database it creates one admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, or no user at all.
  Test: `backend/__tests__/authHardening.test.js`, `backend/__tests__/seedUsers.test.js`.
- **Inactive accounts cannot sign in.** Password and Google login both reject a user whose status is `inactive`.
  The status is checked after the password, so it is revealed only to the account owner.

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

## Data integrity

- **Chunk replacement is atomic.** `syncDocumentChunks` deletes a document's old chunks and inserts the new ones
  in one MongoDB transaction (Atlas runs as a replica set, which transactions require). If the insert fails
  midway, the delete is rolled back and the document keeps its old chunks.
  Test: `backend/rag/__tests__/syncChunks.integration.test.js`, against an in-memory replica set.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
