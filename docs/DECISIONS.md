# Decisions

A short log of project decisions, newest first. Security controls and accepted risks are described in
[SECURITY.md](../SECURITY.md); retrieval and answer measurements in [EVAL.md](EVAL.md).

## How to add an entry

- Add the entry at the top of the log.
- Use the date of the commit that made or recorded the decision. Leave the date out when it is not known.
- Fill in Decision, Reason and Alternatives rejected. Write "Not recorded" rather than guess.
- Cite the commit, file or section a fact comes from.

---

## No admin "Create user" flow

- **Date:** 2026-11-14
- **Decision:** Admins cannot create users from the Users screen or the API.
- **Reason:** Visitors use demo accounts, self-registration is closed by design (`a3839ba`, `SECURITY.md`,
  "Accounts"), and every account-creation path adds attack surface.
- **Alternatives rejected:** An admin-set temporary password with a forced change on first login; an invite link.

## `TRUST_PROXY_HOPS` is 2 in production

- **Date:** 2026-11-05 (`0eaead0`)
- **Decision:** The server counts two proxies in front of it when it reads the client address.
- **Reason:** The production proxy chain is Cloudflare, then Render's proxy. Verified manually by the project owner
  with a request carrying a forged `X-Forwarded-For` header and with a request through iCloud Private Relay; the
  server used the real client address both times. Not reproducible from the repo.
- **Alternatives rejected:** A lower value makes every visitor share a proxy's address and its limits. A higher value
  accepts an entry the client wrote in `X-Forwarded-For`, so a client could dodge every per-address limit
  (`SECURITY.md`, "Chat usage budget").

## "Did you mean" for near-threshold questions not built

- **Date:** 2026-11-01 (`f79ad7f`)
- **Decision:** A question with no chunk at `MIN_SIMILARITY` gets the flat "not found" answer, not suggested document titles.
- **Reason:** Measured on the previous demo library: only one related question in 20 fell below the threshold, and at
  every useful lower bound at least half of the suggestions would have been wrong (`docs/EVAL.md`,
  "Near-miss suggestions (not implemented)").
- **Alternatives rejected:** Pointing to the closest document titles below the threshold. `docs/EVAL.md` suggests
  revisiting it with more questions and documents.

## URL import removed

- **Date:** 2026-10-30 (`e78eeff`)
- **Decision:** The server does not fetch user-supplied URLs. The URL fetching code was guarded against SSRF
  (`b6638de`) and then removed.
- **Reason:** SSRF, and indirect prompt injection: untrusted page text entering the shared index and steering chat
  answers. Demo accounts are open to anyone, regular documents are shared by every admin and viewer, and the benefit
  over importing a file is small (`SECURITY.md`, "Considered and not built").
- **Alternatives rejected:** Shipping it with the designed mitigations: blocking private, loopback and metadata
  address ranges, re-checking every redirect, size and timeout limits, admin-only access, and human review of the
  text before it is indexed.

## No manual document ordering

- **Decision:** Users cannot reorder documents by hand. The client keeps a per-user order in browser storage, puts a
  new document first and drops a deleted one, and offers no control to change it (`src/pages/hubPage/HubPage.tsx`,
  `src/pages/hubPage/hooks/useDocumentOrdering.ts`).
- **Reason:** Not recorded.
- **Alternatives rejected:** Not recorded.
