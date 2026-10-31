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
| Document download as PDF or Word | 200,000 characters of content (`MAX_EXPORT_CHARS`) | 422, suggests Markdown |

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

## Document download

`GET /api/documents/:id/download?format=md|pdf|docx`, built in `backend/documentExport.js`.

- **Same access rule as reading.** The route uses `getCurrentUser` and `canAccessDocument`, like
  `GET /api/documents/:id`, and answers 404 when the user may not read the document, so a download does not
  reveal whether it exists.
- **File name.** `safeFileName` removes control characters (including CR and LF), quotes, `\ / : * ? < > |`,
  bidi controls that could disguise the extension, and leading or trailing dots, caps the length at 100
  characters, and falls back to `document`. `res.attachment()` writes `Content-Disposition` with an ASCII
  `filename` and an encoded `filename*`, so no title can add a header or a path.
- **Content.** PDF text is drawn by pdfkit as text, and Word text goes into XML-escaped text runs, so content
  cannot add PDF objects or Word markup. Characters XML does not allow are dropped.
- **Markdown is not escaped.** The body is the user's own Markdown and is served unchanged; only the title is
  put on one line. It is served as `text/markdown` with `Content-Disposition: attachment`,
  `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, so the browser saves it and never renders
  it as a page. Escaping it would corrupt code blocks and other legitimate text. A Markdown viewer that renders
  raw HTML is outside the app and must sanitize on its own, as for any downloaded file.
- **Build cost.** PDF and Word are built in memory on the request thread, so their content is capped (see
  Input limits). pdfkit wraps one very long word in time quadratic in its length, so runs over 500 characters
  are split onto new lines first; a document at the cap builds in about a tenth of a second.
- **CORS** exposes `Content-Disposition`, so a frontend on another origin can read the file name.

Tests: `backend/routes/__tests__/documentDownload.test.js`, `backend/__tests__/documentExport.test.js`.

## Data integrity

- **Chunk replacement is atomic.** `syncDocumentChunks` deletes a document's old chunks and inserts the new ones
  in one MongoDB transaction (Atlas runs as a replica set, which transactions require). If the insert fails
  midway, the delete is rolled back and the document keeps its old chunks.
  Test: `backend/rag/__tests__/syncChunks.integration.test.js`, against an in-memory replica set.

## Dependencies

- **CI audit.** The `Dependency audit` job in `.github/workflows/ci.yml` runs on pushes to `main` and on every pull request.
  `npm audit --omit=dev --audit-level=high` fails it on a high or critical advisory in a production dependency;
  a full `npm audit` including dev dependencies is reported but does not fail it.
- **CodeQL.** `.github/workflows/codeql.yml` scans the JavaScript and TypeScript code on pushes and pull requests
  to `main` and weekly.
- **xlsx is not covered by npm audit.** The npm registry release of `xlsx` stopped at 0.18.5, which has known
  advisories. SheetJS publishes fixed versions only on `cdn.sheetjs.com`, so `xlsx` 0.20.3 is installed from the
  local tarball `vendor/xlsx-0.20.3.tgz` (`"xlsx": "file:vendor/xlsx-0.20.3.tgz"` in `package.json`), and
  `npm audit` does not check it. 0.20.3 is not affected by the known SheetJS advisories in the GitHub Advisory
  Database; the most recent, a ReDoS (CVE-2024-22363), was fixed in 0.20.2.
  There is no automated check for new SheetJS releases or advisories. Check `cdn.sheetjs.com` and the GitHub
  Advisory Database by hand, and replace the tarball when a fix is released.

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
