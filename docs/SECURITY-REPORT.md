# Security Report

A summary of the security work on InsightDesk: what the review covered, what was found and fixed, and what was
deliberately left as is. Each claim cites a commit or a file in this repository. The controls themselves, with their
tests, are described in [SECURITY.md](../SECURITY.md); this report does not repeat their details.

## 1. Application and threat model

InsightDesk is a document workspace with a chat that answers questions from the user's documents and cites its
sources (`.claude/memory/context.md`). The parts that shape its threat model:

- **Anonymous visitors.** Anyone can start a demo workspace without a password, upload files to it and use the chat
  (`backend/demo.js`, `backend/auth.js`).
- **Shared documents.** Regular documents are shared by every admin and viewer (`SECURITY.md`, "Considered and not built").
- **One model API key.** The chat runs on one provider key with a daily token limit, so one client could stop the
  chat for everyone (`SECURITY.md`, "Chat usage budget").
- **Untrusted files.** Uploaded PDF, Word, Excel, RTF and text files are parsed on the server (`backend/textExtract.js`).

## 2. Method and coverage

The review and the fixes were done with AI assistance (Claude Code) and reviewed by the project owner.

What the review covered, inferred from the commits below: authentication and sessions, Google OAuth, CSRF and
browser headers, input validation, file upload and parsing, rate limits and cost limits, demo data retention,
logging, error responses, and dependencies.

Automated checks:

- **CI** runs lint, tests and build, plus a dependency audit that fails on a high or critical advisory in a
  production dependency (`.github/workflows/ci.yml`, added in `c4676d6`).
- **CodeQL** scans the JavaScript and TypeScript code on pushes, pull requests and weekly
  (`.github/workflows/codeql.yml`, added in `c4676d6`).
- **Tests** guard each control; `SECURITY.md` names the test for each one.

## 3. Findings and fixes

| Area | Issue | Fix | Commit |
| --- | --- | --- | --- |
| Accounts | Fixed demo accounts existed; inactive users were not blocked | Accounts removed, inactive users refused, central error handler | `79e4c9d` |
| Accounts | A disabled user kept working until the session expired | Status checked on every authenticated request | `af6aa8e` |
| Sessions | Logout, a password change or disabling a user did not end other sessions | `tokenVersion` in each token, raised on each of these | `6d28d63` |
| Sessions | JWT algorithm not pinned | HS256 pinned on sign and verify; `__Host-` cookie in production | `0e838f5` |
| Sessions | The server could start with a placeholder or missing secret | Refuses to start outside development and tests | `e80268b` |
| Sessions | Cookies were not Secure by default | Secure unless in development or test | `d63f83a` |
| Sessions | Logout answered 200 and cleared the cookie even when ending the session in the database failed, so the token stayed valid; the client also cleared the user before the server answered | The route answers 500 and keeps the cookie; the client waits and offers Retry | `eb6cae0`, `6b5f975` |
| Sessions | The next user in the same tab could see the previous user's cached data and chat history | Client state cleared on sign-out and sign-in; late requests of a finished session ignored | `b9bdc49`, `1c42110` |
| Login | Short passwords, timing that could reveal accounts, no per-account limit on failed logins | 12-character minimum for new passwords, comparison with a dummy hash, per-account limit | `77126c1` |
| Login | Email case could split or hide an account | Emails normalized, with a migration script | `5c6987d` |
| Google OAuth | No `state`, so login CSRF was possible | Random state in a cookie, compared in constant time | `d2c2e48` |
| Google OAuth | An unverified Google email could reach an account | Verified email required; offline access dropped | `d2589cb` |
| CSRF | Cross-site state-changing requests were not refused | Origin check on non-GET `/api` requests | `699035b` |
| Browser | Inline scripts allowed by the CSP | `'unsafe-inline'` removed from `script-src` | `3c44fc7` |
| Browser | Broad network and image sources in the CSP | `connect-src` and `img-src` narrowed | `750c3c8` |
| Browser | The main page and built assets did not carry the security headers | Static files served after the security middleware | `c53ec77` |
| Parsing | ReDoS in RTF text extraction; unbounded group nesting | Single-pass whitespace removal; nesting capped | `666db55` |
| Parsing | A small crafted file could crash the server out of memory | Each upload parsed in a child process with memory and time limits | `e410c3e`, `78ef988` |
| Uploads | File type trusted from the client | File signature checked; upload form and rate limits | `0a1a18a` |
| Demo | Parallel requests could pass the demo document and attachment limits | Limits taken with one conditional update | `8c8dc32` |
| Demo | Demo data was not removed | Removed on logout and after expiry | `dde2ae2` |
| Rate limits | An IPv6 client could change the low bits of its address to multiply each limit | Per-address limits count the /56 network | `46bcda1`, `d2c4441`, `6a7f7e6` |
| Cost | Per-minute limits alone let one address use up the provider's daily tokens | Daily limits per account, sandbox and address | `2b6f594` |
| Chat | A citation with a zero-width character inside its brackets, such as `[​c9]`, did not match `verifyCitations`, so an id the model invented was neither removed nor reported | Zero-width characters removed inside citation brackets before the ids are checked | `3ac1503` |
| Logging | Secrets and personal data could reach the logs; auth and admin events were not recorded | Logs hold reasons and ids only; auth and admin events recorded | `a261096` |
| Errors | Raw chat errors reached the client | Fixed message; details only in the server log | `09b8432` |
| Input | Ids and several request bodies were not validated | zod schemas for ids, prompt, suggestions, password and profile | `96be677` |

The measured impact of the parsing issues is documented in `SECURITY.md` ("Text extraction"). It is cited from there
and was not re-measured for this report.

## 4. Verified manually

**Client address behind the proxy chain.** Verified manually by the project owner, not reproducible from the repo.

- In production the proxy chain is Cloudflare, then Render's proxy, so the correct `TRUST_PROXY_HOPS` value is 2.
- It was checked with a request carrying a forged `X-Forwarded-For` header, and with a request through iCloud
  Private Relay. The server used the real client address both times.
- With a value of 3, the forged header would have been accepted as the client address, so a client could dodge every
  per-address limit.
- The server warns at startup when the value is unset, zero or invalid, but cannot detect a wrong non-zero value
  (`SECURITY.md`, "Chat usage budget").

## 5. Accepted risks

Each of these is described with its reasoning in `SECURITY.md`:

- **`style-src 'unsafe-inline'`** stays, helmet's default. Injected CSS cannot run code ("Browser").
- **No CSRF token.** `SameSite=Lax` cookies plus the Origin check cover the same attacks for a single-site app
  ("Cross-site requests").
- **The JWT payload is readable.** It is signed, not encrypted, and holds only email, role and token version ("Session cookie").
- **A client controlling an IPv6 /48** gets 256 times each per-address limit. A shorter prefix would group more
  unrelated visitors ("Rate limiting").
- **PDF size cannot be checked before parsing.** The worker's limits contain a hostile PDF ("Text extraction").
- **A document created while its demo workspace is removed** can be left behind, invisible to everyone ("Demo limits").
- **The chat's UTC day may not match the provider's window**, and other uses of the same key are not counted
  ("Chat usage budget").
- **`xlsx` is installed from a vendored tarball** that `npm audit` does not check; new advisories are checked by hand
  ("Dependencies").

## 6. Considered and not built

- **Self-registration.** Closed by design (`a3839ba`). `POST /api/auth/register` answers 403, and a Google login for an
  unknown address is refused. Visitors use demo accounts. Test: `backend/__tests__/registrationClosed.test.js`.
- **Admin "Create user" flow.** Rejected: visitors use demo accounts, self-registration is closed by design, and every
  account-creation path adds attack surface.
- **Adding a document from a URL.** The fetching code was guarded against SSRF (`b6638de`) and then removed
  (`e78eeff`). Risks: SSRF and indirect prompt injection into the shared index ("Considered and not built" in `SECURITY.md`).

## 7. Answer quality

The chat must cite only the chunks it was given. The numbers below are from `docs/EVAL.md`. They are point-in-time
measurements, taken before `verifyCitations` learned to accept zero-width characters inside citation brackets
(`3ac1503`, 2026-11-08). The evaluation counts invented ids with `verifyCitations` (`eval/answers.js`), so an
invented id written with a zero-width character was not counted in these runs.

- **2026-11-06, current demo library:** 0 invented citation ids in every set. On 15 unrelated questions sent with
  their top chunks on purpose, 45 of 45 answers were refusals with no citation, in both prompt wordings.
- **2026-11-08, `DEFAULT_PROMPT` against the experiment wording:** 0 invented citation ids in both; 113 of 120
  answers with a valid citation for the default.

A user can rate only their own answers; another user's record returns 404 (`docs/EVAL.md`, "User feedback").

## 8. Limits of this report

- The CodeQL alert dismissals are recorded on GitHub, not in the repo. `SECURITY.md` names the dismissed alerts and
  the reasons.
- The manual CSP check in headless Chromium and the proxy check in section 4 have no artifact in the repo.
- The measured memory limits, file sizes and the RTF blocking time in `SECURITY.md` were not re-measured.
- This report does not say whether CI passes on the current `main`.
