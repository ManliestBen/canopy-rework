# Plan 004: Rate-limit the PIN-change endpoint, require loopback for initial PIN, constrain test-email

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 310da15..HEAD -- server/src/auth/routes.ts server/src/routes/announcements.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-remote-auth-boundary-tests.md (reuses its remote-peer test seam)
- **Category**: security
- **Planned at**: commit `310da15`, 2026-07-15

## Why this matters

Two authenticated endpoints undercut Canopy's documented trust model:

1. **`POST /api/auth/pin` (change PIN) has no brute-force limit.** `/login`
   and `/verify` are wrapped in an 8-attempts-per-15-min limiter, but the
   PIN-change route — which also verifies `currentPin` — is only under the
   loose global 120/min write limiter. A 4-digit PIN is brute-forceable an
   order of magnitude faster here than through the intended login path.
2. **Before any PIN exists, any LAN device can set it.** The guard skips the
   current-PIN check when `!hasPin()`, and does not require loopback — so a
   guest phone can claim the initial PIN and lock the family out of their own
   panel.
3. **`POST /api/email/test` sends from the family's real Gmail identity to
   any address**, under only the global write limiter — an authenticated
   trigger tied to a reputation-bearing sender with no dedicated cap.

## Current state

Relevant files:

- `server/src/auth/routes.ts` — the limiter and the PIN routes:

  ```ts
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.', code: 'rate_limited' },
  });
  ...
  authRouter.post('/login', loginLimiter, (req, res) => { ... });
  authRouter.post('/verify', loginLimiter, (req, res) => { ... });
  ...
  authRouter.post('/pin', (req, res) => {          // <-- no limiter
    const { currentPin, newPin } = PinSetSchema.parse(req.body);
    if (hasPin() && !isLoopback(req)) {            // <-- initial PIN: no loopback req
      if (!currentPin || !verifyPin(currentPin)) {
        res.status(403).json({ error: 'Current PIN is wrong', code: 'bad_pin' });
        return;
      }
    }
    setPin(newPin);
    ...
  });
  ```

  `isLoopback` and `verifyPin`/`hasPin`/`setPin` are already imported here.

- `server/src/routes/announcements.ts:58-71` — the `emailRouter`:

  ```ts
  const TestSchema = z.object({ to: z.string().email() });
  emailRouter.post('/test', wrap(async (req, res) => {
    const { to } = TestSchema.parse(req.body);
    await sendEmail([to], 'Canopy test email 🌳', 'If you can read this, ...');
    res.json({ ok: true });
  }));
  ```

  `digestRecipients()` (already imported in this file, from
  `../services/digest.js`) returns the configured recipient list.

- `server/src/app.ts:63-64` — `authRouter` is mounted before
  `requireAuth`, so `/api/auth/pin` is reachable pre-session (intended for
  first-run setup). `emailRouter` is mounted at `/api/email` **after**
  `requireAuth` (`app.ts:65,79`).
- Test seam: plan 003 added `x-canopy-test-remote` (honored only under
  `process.env.VITEST`) to `isLoopback`. Reuse it to simulate a remote peer.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Server tests | `npm test --workspace server` | all pass |
| All tests | `npm test` | all pass |

If server tests fail at import with `NODE_MODULE_VERSION ...
better_sqlite3.node`, run `npm rebuild better-sqlite3` once (Node 20/22).

## Repo conventions that apply

- `express-rate-limit` limiters are module-level constants in the router
  file (see `loginLimiter`). Keyed on `req.ip` by default (loopback for all
  supertest calls — see the rate-limit note in plan 003).
- Error envelope: `{ error, code }`; validation via zod (`.parse` throws →
  central handler returns 400).
- Tests: supertest integration, in-memory DB per test.

## Scope

**In scope**:

- `server/src/auth/routes.ts`
- `server/src/routes/announcements.ts`
- `server/src/phase4.test.ts` OR a new `server/src/auth.hardening.test.ts`
  (create the new file — keeps the change self-contained)

**Out of scope**:

- `server/src/auth/middleware.ts` — the seam from plan 003 is reused
  unchanged.
- The `loginLimiter` values on `/login` and `/verify` — leave as-is.
- The global write limiter in `app.ts`.
- Gmail send internals (`services/gmail.ts`).

## Git workflow

- Branch: `advisor/004-pin-email-hardening`
- Commit style: short imperative summary (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rate-limit and loopback-guard the PIN-change route

In `server/src/auth/routes.ts`:

1. Apply the existing `loginLimiter` to `/pin`:
   `authRouter.post('/pin', loginLimiter, (req, res) => { ... })`.
2. Change the initial-PIN guard so first-time PIN setup requires the panel:

   ```ts
   const { currentPin, newPin } = PinSetSchema.parse(req.body);
   if (!isLoopback(req)) {
     if (!hasPin()) {
       res.status(403).json({ error: 'Set the PIN from the panel first', code: 'panel_only' });
       return;
     }
     if (!currentPin || !verifyPin(currentPin)) {
       res.status(403).json({ error: 'Current PIN is wrong', code: 'bad_pin' });
       return;
     }
   }
   setPin(newPin);
   ```

   Now: panel (loopback) can set/change freely; a remote peer can change an
   existing PIN only with the current one, and can never create the initial
   PIN.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Constrain the test-email recipient

In `server/src/routes/announcements.ts`, change `/test` so it emails a
**configured** recipient, not an arbitrary address:

```ts
emailRouter.post('/test', wrap(async (req, res) => {
  const recipients = digestRecipients();
  if (recipients.length === 0) {
    res.status(400).json({ error: 'Add a digest recipient first', code: 'no_recipient' });
    return;
  }
  await sendEmail(recipients, 'Canopy test email 🌳',
    'If you can read this, Canopy can send email. All set!');
  res.json({ ok: true });
}));
```

Remove the now-unused `TestSchema` (and the `to` body field). This closes the
arbitrary-recipient trigger while preserving the feature's purpose
("does email work?"). If the operator wants to test a NOT-yet-configured
address, that is a settings change first — acceptable friction.

Also add a dedicated tight limiter for `/test` (defense in depth against the
reputation-bearing sender), a module-level constant in this file:

```ts
const emailTestLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many test emails. Try later.', code: 'rate_limited' } });
```

and apply it: `emailRouter.post('/test', emailTestLimiter, wrap(...))`.
Import `rateLimit from 'express-rate-limit'`.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Tests

Create `server/src/auth.hardening.test.ts` (supertest, in-memory DB, reuse
the `x-canopy-test-remote` seam via `.set({ 'x-canopy-test-remote': '192.168.1.50' })`):

1. **Remote cannot create the initial PIN**: no PIN set, remote
   `POST /api/auth/pin` with `{ newPin: '4321' }` → 403 `code: 'panel_only'`;
   then `GET /api/auth/status` shows `hasPin: false`.
2. **Panel can create the initial PIN**: loopback (no header)
   `POST /api/auth/pin` `{ newPin: '4321' }` → 200; `hasPin: true`.
3. **Remote changing an existing PIN needs the current one**: after (2),
   remote `POST /api/auth/pin` `{ newPin: '9999' }` (no `currentPin`) → 403;
   with correct `{ currentPin: '4321', newPin: '9999' }` → 200.
4. **PIN-change route is rate-limited**: this is hard to assert without
   burning the shared 8/15-min limiter for the whole process. Instead assert
   the limiter is wired by checking a rate-limit header is present on a `/pin`
   response: `expect(res.headers['ratelimit-limit']).toBeDefined()` (the
   `standardHeaders: true` limiter emits `RateLimit-*`). Do NOT loop to 429 —
   it would poison later tests sharing the limiter.
5. **Test-email requires a configured recipient**: with `digestEmails`
   unset/empty, `POST /api/email/test` → 400 `code: 'no_recipient'`.
6. **Test-email no longer honors an arbitrary `to`**: set a digest recipient
   via `PATCH /api/settings { digestEmails: 'known@example.com' }`, then
   `POST /api/email/test` with body `{ to: 'attacker@evil.com' }`. Because
   `sendEmail` would try real network, stub it: `vi.mock('./services/gmail.js', ...)`
   or inject via the existing seam if present — **check `services/gmail.ts`
   for a test seam first**; if none exists, mock the module and assert
   `sendEmail` was called with `['known@example.com']`, never
   `'attacker@evil.com'`. If mocking `gmail.js` proves entangled, it is
   acceptable to assert only cases 1–5 and note case 6 as covered-by-review
   in the PR — but try the mock first.

Keep total `/login`+`/verify`+`/pin` calls in this file well under 8 to avoid
the shared limiter (see plan 003's note).

**Verify**: `npm test --workspace server` → all pass, ≥5 new tests.

### Step 4: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → all workspaces pass.

## Test plan

Step 3 (≥5 cases). Pattern: `server/src/phase1.test.ts` (auth flows) +
`server/src/auth.boundary.test.ts` from plan 003 (remote seam usage).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -n "post('/pin', loginLimiter" server/src/auth/routes.ts` → present
- [ ] `grep -n "panel_only" server/src/auth/routes.ts` → present
- [ ] `grep -n "emailTestLimiter" server/src/routes/announcements.ts` → present
- [ ] `grep -n "TestSchema" server/src/routes/announcements.ts` → no output (removed)
- [ ] `server/src/auth.hardening.test.ts` exists; ≥5 tests pass
- [ ] `git status --porcelain` shows only in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 003 has not landed (no `x-canopy-test-remote` seam in
  `server/src/auth/middleware.ts`) — this plan's tests depend on it.
- Removing `TestSchema` breaks an import elsewhere (`grep -rn TestSchema
  server/src` before deleting).
- The existing PIN-auth test in `phase1.test.ts` that asserts "changing an
  existing PIN from the panel does not need the current PIN" fails — it
  should still pass (panel path unchanged); if it fails, your guard logic
  changed panel behavior. Fix the logic, not that test.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Consider raising the minimum PIN length (schema allows 4–8 digits) as a
  follow-up; not in scope here.
- The `/test` email now always goes to configured recipients — update
  `docs/SETUP_INTEGRATIONS.md` if it documents sending a test to an
  arbitrary address (check during review).
- Reviewer focus: that the panel (loopback) PIN flow is completely
  unchanged, and that the shared `loginLimiter` isn't exhausted by the new
  tests.
