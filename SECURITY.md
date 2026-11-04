# Security

Security controls in Insight Desk and the tests that guard them.

## Accounts

- **No hard-coded accounts.** The server never creates fixed demo users such as `admin@demo.com`, in any environment.
  On an empty database it creates one admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD`, or no user at all.
  Test: `backend/__tests__/authHardening.test.js`, `backend/__tests__/seedUsers.test.js`.
- **Emails are lowercase.** Login, the seed and Google normalize an address, so case cannot split or hide an account. Accounts stored earlier are converted by `backend/scripts/normalizeEmails.js`: `--dry-run` reports
  what would change, `--apply` writes, and addresses that collide are reported and never merged. Until it has run,
  login also tries the spelling as typed, so an existing account keeps working.
  Tests: `backend/__tests__/emailNormalization.test.js`, `backend/__tests__/normalizeEmails.integration.test.js`.
- **Inactive accounts cannot sign in.** Password and Google login both reject a user whose status is `inactive`.
  The status is checked after the password, so it is revealed only to the account owner.
- **Disabling a user takes effect at once.** `getCurrentUser` already loads the user on every authenticated request,
  so the check costs no extra query. An inactive user gets 401 on the next request, including an admin on an admin
  route. Test: `backend/__tests__/disabledUser.test.js`.
- **Logging out or changing the password ends existing sessions.** Each token carries the user's `tokenVersion`, and
  a token with an old version gets 401. Logout raises it, which ends the user's sessions on every device. A password
  change raises it and gives the current session a new token. Disabling a user raises it too, so re-enabling does
  not bring old sessions back. A token issued before this field existed counts as version 0.
  Test: `backend/__tests__/tokenVersion.integration.test.js`.
- **Google login checks an OAuth `state`.** `GET /api/auth/google` sends a random 256-bit state to Google and
  stores it in an HttpOnly, `SameSite=Lax` cookie scoped to `/api/auth/google` for 10 minutes. The callback
  compares it in constant time, clears the cookie whatever the outcome, and on a missing or wrong state
  redirects to `/login?error=google_state_mismatch` without exchanging the code. This blocks login CSRF.
  Test: `backend/__tests__/googleOAuthState.test.js`.

## Data retention

- **Demo workspaces are temporary.** A demo account and everything it owns (documents, chunks, uploaded files)
  are deleted on logout, since a demo account has no password and cannot be reached again. If the visitor never
  logs out, they are deleted after 24 hours by a cleanup that runs when the server starts and every hour after,
  so data can outlive its expiry by up to an hour, or until the next start if the server is asleep. A workspace can
  also go sooner when the demo is busy (see Demo limits).
  Only accounts with the `demo` role are ever matched, and the logs record only how many were removed.
  Tests: `backend/__tests__/demoCleanup.integration.test.js`, `backend/__tests__/demoCleanup.test.js`,
  `backend/__tests__/demoLogout.test.js`.

## Errors

- **Generic error responses.** `backend/middleware/errorHandler.js` is mounted last and turns any unhandled error
  into `{ detail: "Internal server error" }` (500) or a generic 4xx message. Messages, stack traces, and queries
  are logged on the server and never sent to the client.
  Test: `backend/middleware/__tests__/errorHandler.test.js`.
- **Chat errors** return a fixed message; the upstream model error stays in the server log. A missing provider key
  gets the same message, and only the log names it, so a response never reveals the server's configuration.
  Tests: `backend/__tests__/aiChat.test.js`, `backend/__tests__/aiProviderCalls.test.js`.
- **Model provider calls are bounded.** The answer call times out after 30 seconds and the keyword translation
  after 10, so a stalled provider cannot hold a request past the proxy's timeout. Nothing is retried: the SDK would
  first wait as long as the provider's `Retry-After` says, with no cap and outside the timeout. A 429 therefore
  gets the "busy" answer at once, and a brief provider error reaches the user, who can ask again.
  The timeout covers the wait for the response headers. Test: `backend/__tests__/aiProviderCalls.test.js`.

## Input limits

| Input | Limit | On violation |
| --- | --- | --- |
| JSON request body | 2 MB (`JSON_BODY_LIMIT` in `backend/middleware/setup.js`) | 413 `Request body too large` |
| Chat message | 2000 characters (`aiChatSchema`) | 400, the model is not called |
| Document content | 500,000 characters | 400 |
| Bulk import | 50 documents | 400 |
| Document download as PDF or Word | 200,000 characters of content (`MAX_EXPORT_CHARS`) | 422, suggests Markdown |
| Uploaded file | 10 MB; 2 MB in a demo workspace | 413, names the limit |
| Upload form | One file, no other fields or parts, a file name of at most 255 characters | 400 |

Tests: `backend/middleware/__tests__/setup.test.js`, `backend/__tests__/aiChat.test.js`.

## Browser

- **The CSP allows no inline scripts.** `script-src` is `'self'` only, and `script-src-attr` is `'none'`
  (helmet's default), so an injected `<script>` or `onclick=` handler does not run. The theme script that used
  to be inline in `index.html` now lives in `public/theme-init.js` and still runs in `<head>`, before the first paint.
  Static files are served after the security middleware, so the main page, `index.html` and the built assets
  carry the same headers as every other response. Before this was fixed, only direct loads of inner pages did.
  Tests: `backend/middleware/__tests__/setup.test.js` checks the header, and `backend/__tests__/app.test.js`
  measures the headers on the real app's main page.
- **Network and image sources are limited.** `connect-src` is `'self'` and `img-src` is `'self' data:`, so an
  injected script or image cannot send data to another host through them. `style-src` and `font-src` keep helmet's
  `https:` default for the external font provider until the fonts are self-hosted.
- **Static files keep their cache rules when compressed.** They pass through the same `compression()` as the API.
  Hashed files under `assets/` stay `immutable` for a year, and everything else, including `index.html`, is
  revalidated on each load, so a deploy reaches visitors at once.
  Checked by hand: `dist/index.html` from `npm run build` has no inline `<script>`. Under the real middleware,
  headless Chromium renders the login page with the theme set, and an inline script on a probe page is blocked.
- **Known gap, accepted:** `style-src` still includes `'unsafe-inline'`, helmet's default, kept on purpose.
  Injected CSS cannot run code; at worst it restyles the page or, in rare cases, leaks a value from it.
  We have not checked whether removing it would break a dependency that injects `<style>` tags.
- **Signing out or in clears the previous session's data.** Before this fix, the cached document list and
  quality data stayed in memory for the rest of the tab's life, and the AI chat history stayed in
  `localStorage`, so the next user in the same tab (or, for the chat, the same browser) could see them.
  `AuthProvider` now clears the TanStack Query cache and the `assistantChat` key after logout and on every
  sign-in. Test: `src/auth/__tests__/AuthProvider.test.tsx`.

## Session cookie

- The session is a JWT signed with `JWT_SECRET`, with HS256 pinned on sign and verify, so any other algorithm is
  rejected. Test: `backend/__tests__/sessionToken.test.js`. The cookie is `__Host-access_token` (plain `access_token`
  in development and tests, which run over http and could not set the prefix): HttpOnly, `SameSite=Lax`,
  Secure unless `NODE_ENV` is `development` or `test` and `ENV` is not `prod`, path `/`, expiry `ACCESS_TOKEN_MINUTES` (60).
- **The server refuses to start without a real `JWT_SECRET`.** The built-in development secret and the README's
  example are refused, as is a blank value, unless `NODE_ENV` is `development` or `test` and `ENV` is not `prod`.
  Any other environment, including an unset `NODE_ENV`, counts as production (`backend/runtimeEnv.js`), and also
  gets the production limit of 100 `/api` requests per 15 minutes (1000 in development and test).
  Test: `backend/__tests__/startupSecret.test.js` starts a real process with a clean environment.
- The JWT is signed, not encrypted: its payload (email and role) is readable by whoever holds the cookie.
  It holds no password or secret. Accepted; CodeQL's "Clear text storage of sensitive information" alert
  on `setAuthCookie` is dismissed with a reference to this section.
- Both cookies are Secure by default, so a partial production configuration cannot send them without it.
  The `oauth_state` cookie takes its options through an object spread, which CodeQL does not follow, so its
  cookie alerts on `backend/auth.js` are dismissed as false positives.
  Test: `backend/__tests__/googleOAuthState.test.js` checks HttpOnly, `SameSite=Lax`, and Secure in production.

## Rate limiting

- All `/api/` routes share one limit per client IP (100 per 15 minutes in production), plus stricter limits on
  password attempts (10 failed per 15 minutes), demo creation (10 per hour) and uploads (20 per 15 minutes, counting
  attachments and text extraction together), so one client cannot keep the extraction queue full.
- The SPA fallback (`index.html`) has its own generous limit: 1000 requests per 15 minutes per client IP, in every
  environment. Only full page loads and refreshes reach it (static assets are served first, and in-app navigation
  stays in the browser), so the limit leaves room for many visitors behind one shared IP while stopping a client
  that requests pages in a loop. It uses the same client IP as the `/api/` limits (`TRUST_PROXY_HOPS`).
- Static files under `dist/` are not rate-limited: they are fixed files with no user input.
- Tests: the upload limit in `backend/routes/__tests__/uploadLimits.test.js`, the login limit in
  `backend/__tests__/authRateLimit.test.js`, the SPA fallback limit in
  `backend/middleware/__tests__/setup.test.js`.

## Cross-site requests (CSRF)

The app authenticates with cookies, and frontend and API are one site (a single Render service), so two layers
stop another site from acting as the user.

- **Both cookies are `SameSite=Lax`.** The browser does not send them on a POST, PUT, PATCH or DELETE from another
  site, so such a request reaches the API unauthenticated. The value is explicit, so Chrome's two-minute exception
  for cookies without a `SameSite` attribute does not apply.
  - `oauth_state` must be Lax: Google's redirect to `/api/auth/google/callback` is a top-level GET navigation
    from another site. `Strict` would drop the cookie there and every Google login would fail. Lax works only
    because Google returns with a GET (we do not use `response_mode=form_post`).
  - The session cookie stays Lax rather than Strict. The SPA's own API calls are same-site either way, so Strict
    would mainly break links to the API opened from outside, such as a document download link. The only GET route
    that changes state is `GET /api/auth/google/callback`, which can create a user and a session. The one-time
    OAuth state check protects it instead of the Origin check, so Strict would add almost nothing.
- **Origin check on state-changing requests.** `rejectCrossSiteRequests` in `backend/middleware/setup.js` refuses
  any non-GET/HEAD/OPTIONS request under `/api` whose `Origin` is not ours (403). That covers routes that need no
  cookie, which Lax cannot protect: without it, a form on another site could start a demo session in the
  visitor's browser or log them out. Origins are compared after normalizing scheme, host and port. Ours is
  `FRONTEND_URL` or `APP_BASE_URL` (Render sets only `FRONTEND_URL`), plus, only in development and tests, the
  Vite dev servers on localhost.
  `Origin: null` is refused. A request with no `Origin` passes, since browsers send one on every such request.
  Blocked requests are logged with the origin host and route only. In production, the server logs an error at
  startup if neither variable is set, because every state-changing request would then be refused.
- **CORS does not block requests.** It only decides whether a page on another origin may read the response, so
  it is not a CSRF control.
- **No CSRF token.** With one site, Lax plus the Origin check covers the same attacks without a token round trip
  on every request and upload. CodeQL's "Missing CSRF middleware" rule looks for known CSRF libraries and does
  not recognize this check, so its alert on `backend/app.js` is dismissed with a reference to this section.
  Test directories are excluded from CodeQL in `.github/codeql/codeql-config.yml`: test code never runs in
  production, and its stand-in Express apps raised the same alert.

Test: `backend/__tests__/crossSiteRequests.test.js`.

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

## File uploads

- **The content must match the type.** The extension and the MIME type both come from the client, so
  `backend/fileSignature.js` also checks the first bytes: `%PDF-` for PDF, a ZIP header for `.docx` and `.xlsx`, an OLE
  header for `.xls`, `{\rtf` for RTF. A text file must hold no NUL byte in its first 8 KB and must not start with a
  known binary signature. Legacy one-byte encodings still pass.
- **The extension decides the stored type.** The browser's type can only refuse a file that claims another type. What
  is stored, parsed and served comes from the extension, so `text/x-markdown` for a `.md` file is parsed like `text/markdown`.
- **Clear refusals.** UTF-16 text files and password-protected Office files get a 400 that says what to do.
- A file is served as an attachment with `nosniff` whatever it holds, so these checks limit what reaches the parsers;
  they do not prove a file is harmless.
- An attachment is sent with `Cache-Control: no-store`, so a shared computer's browser or a proxy keeps no copy.
  Tests: `backend/__tests__/fileSignature.test.js`, `backend/routes/__tests__/uploadLimits.test.js`,
  `backend/routes/__tests__/documentAttachments.test.js`.

## Text extraction

- **Parsing runs in a separate process.** A small file can expand enormously: a 1.4 KB spreadsheet or a 243 KB Word
  file used to crash the whole server out of memory. `backend/textExtract.js` now parses each upload in a new child
  process (`backend/extractWorker.js`), so a hostile file can only kill that process.
  - **Limits:** 160 MB of V8 heap, 256 MB of total memory, 20 seconds. Total memory is watched by a thread inside
    the worker, because the heap limit does not count Buffers. A file that hits a limit gets a 422 and is not stored.
  - **One at a time:** one file is parsed at a time and three may wait. Beyond that the answer is 503 with `Retry-After`.
  - **No secrets:** the worker starts with an empty environment.
- **ZIP files are checked before they are parsed.** For `.docx` and `.xlsx`, `backend/zipGuard.js` inflates every entry
  with a 20 MB total limit, so a forged size in the archive does not help. It walks the central directory, as the
  parsers do, and refuses encrypted and ZIP64 archives.
- **Spreadsheets are measured before they are converted.** At most 1,000,000 cells across 50 sheets, checked on the
  sheet range before `sheet_to_json` builds it.
- **Known gap, accepted: PDF.** A PDF has no reliable decompressed size to check in advance, since streams can sit
  inside compressed object streams. Only the first 200 pages are read, and the worker's limits are what stop a hostile
  PDF. It costs one worker run, not the server.
- A damaged file, as before, is stored with no extracted text.
  Tests: `backend/__tests__/extractionSafety.test.js`, `backend/routes/__tests__/documentAttachments.test.js`.
- **RTF parsing runs in linear time and bounded memory.** Uploaded RTF is converted to text in
  `backend/textParsers.js`. Blanks before line breaks are removed by a single pass, not by the regex
  `/[ \t]+\n/`, which backtracked quadratically on a long run of spaces: a 10 MB upload, open to any demo
  visitor, could block the server for hours. Group state is saved for at most 1000 nested `{` groups
  (`MAX_RTF_DEPTH`); deeper groups are only counted, so a file of nested braces cannot exhaust memory.
  Test: `backend/__tests__/textExtract.test.js`.

## Demo limits

- **Limits hold under parallel requests.** A check followed by a separate write let parallel requests all pass: ten
  at once could leave 28 documents in a workspace limited to 20, and ten attachments on a document limited to one.
  `backend/demoQuota.js` now takes a document slot with one conditional update, and an attachment is added or removed
  by an update whose filter includes the limit. A loser of the race gets a 403 and leaves no file behind, and a slot
  is given back when a write fails or a document is deleted.
  Test: `backend/__tests__/demoLimitsRace.integration.test.js`, against a real in-memory MongoDB.

- **Storage is bounded.** Anyone can open a demo workspace, and without a cap one address could store 500 MB in 15
  minutes. In a demo workspace, a file is at most 2 MB and at most 20,000 characters of its text are kept. Uploads
  count against a 5 MB quota per workspace, as the file size plus 12 bytes per character of text, since chunks with
  vectors take far more room than the text itself. At the worst case, with content written directly on top, a workspace
  takes about 10 MB.
- **At most 40 live workspaces.** When a new one goes over the cap, the least recently active workspace is removed with
  everything in it. New visitors are never refused, because a refusal would let one address block the demo for everyone
  by filling the cap. At the worst case this is about 400 MB. Activity is recorded at most every 5 minutes.
- **Known gap, accepted.** A request that creates a document at the same moment its workspace is removed can leave that
  document behind. It is invisible to everyone, and it takes a request racing a removal to create.
  Tests: `backend/__tests__/demoQuota.integration.test.js`, `backend/__tests__/demoActivity.test.js`.

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
