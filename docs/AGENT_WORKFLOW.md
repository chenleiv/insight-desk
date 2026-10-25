# Working with a Coding Agent in Insight Desk

How I work with Claude Code on this repo: the agent builds, I approve and review.

## Guardrails

- **Rules file:** `.claude/CLAUDE.md` holds the working rules: plan first, wait for approval, never edit a test just to make it pass, all repo content in English, and the definition of done (`npm test`, `npm run lint`, `npm run build`, plus a summary of what changed, why, and the risks).
- **Secrets:** `.claude/settings.json` denies `Read(**/.env)` and `Read(**/.env.*)`, so the agent cannot open `backend/.env` or any other env file. The earlier rule, `Read(.env)`, only covered the repo root.
- **Allowlist:** read-only git commands plus test, lint, and build run without a prompt. Everything else asks first.

## The loop

1. **Ask** for one small, scoped task.
2. **Plan:** the agent reads the code and replies with a short plan: files, approach, and risks. No edits yet.
3. **Approve:** I approve or adjust the plan.
4. **Change:** the agent makes the smallest change that does the job.
5. **Verify:** the agent runs test, lint, and build, and reports what failed and why.
6. **Decide:** if something fails, the agent stops and asks. It does not paper over the failure.
7. **Commit:** one focused commit per step, with a message that explains the change.

## Real example: a test for `/health`

**Ask:** "Add a test for the `/health` endpoint."

**Plan (approved):** `backend/index.js` connects to MongoDB and calls `listen()` on import, so it can't be imported in a test. The smallest fix is to move the handler into `backend/routes/health.js` without changing its behavior, mount it with `app.use(healthRouter)`, and test the router on a throwaway Express app. Node's built-in `fetch` sends the request, so no new dependency is needed. The risk is route order: `/health` must stay registered before the `app.get('*')` SPA fallback, or it would return `index.html`.

**Change:**

```js
// backend/routes/health.js
router.get('/health', (req, res) => {
    res.json({ ok: true });
});
```

**Test** (`backend/routes/__tests__/health.test.js`): the test starts the router on port `0` (a random free port), sends `GET /health`, and expects status `200` with the body `{ ok: true }`.

**Verify:**

- `npm test`: 37 of 37 pass.
- `npm run build`: OK.
- `npm run lint`: 4 errors, all in `TourOverlay.tsx`. They were already there and are unrelated to this change, since lint only checks `.ts` and `.tsx` files. The agent flagged them, and I decided to commit anyway and fix them as a separate task.

**Commit:** `f5871cb Extract /health into its own router and add a test for it`. It touches three files, with 37 lines added and 3 removed.

**Known limitation:** the test checks the router on its own, not the route order in `index.js`.
