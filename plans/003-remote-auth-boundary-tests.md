# Plan 003: Put the remote (non-loopback) auth boundary under test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 310da15..HEAD -- server/src/auth/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (plan 004 depends on THIS)
- **Category**: tests
- **Planned at**: commit `310da15`, 2026-07-15

## Why this matters

Canopy's only access control is: loopback (the wall panel) is trusted;
everything else must present a session cookie obtained via PIN login. Every
server test runs through supertest, which always connects over loopback — so
`requireAuth`'s two load-bearing branches (accept a valid session from a
remote peer; reject a remote peer without one) have **zero coverage**. A
regression that made `hasValidSession` always-true, or dropped the 401,
would ship with CI green. Plan 004 modifies these auth routes; this safety
net must exist first.

## Current state

Relevant files:

- `server/src/auth/middleware.ts` — the boundary. Verbatim today:

  ```ts
  const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  ...
  export function isLoopback(req: Request): boolean {
    return LOOPBACK.has(req.socket.remoteAddress ?? '');
  }
  ...
  export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (isLoopback(req) || hasValidSession(req)) {
      next();
      return;
    }
    res.status(401).json({
      error: 'Sign in from the Canopy panel, or log in with the family PIN.',
      code: 'unauthorized',
    });
  }
  ```

- `server/src/app.ts:63-79` — mount order: `/api/health` and `/api/auth`
  before `app.use('/api', requireAuth)`; all feature routers after.
  `app.set('trust proxy', false)` at `app.ts:29` (headers cannot spoof the
  address — a deliberate property; do not change it).
- `server/src/auth/pin.ts` — `createSession(label, ttlDays = 90)` inserts a
  SHA-256-hashed token into `auth_sessions`; negative/zero `ttlDays`
  produces an already-expired row (useful for the expiry test).
- `server/src/auth/routes.ts` — `/api/auth/status` reports
  `{ isPanel, authenticated, hasPin }`; `/login` sets the `canopy_session`
  httpOnly cookie.
- Existing auth tests: `server/src/phase1.test.ts:55-107` (`describe('PIN auth')`)
  — all loopback. Use its style (supertest + `openTestDb`/`closeDb` per test).
- `app.ts` already uses `process.env.VITEST` for test-only behavior
  (`app.ts:43`: pino-http is skipped under vitest) — precedent for the seam
  below.

The problem to solve: supertest always connects from `::ffff:127.0.0.1`, so
`isLoopback` is always true in tests. The plan adds a **test-only seam** so
tests can simulate a remote peer.

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

- Server tests are real integration tests over supertest — no route mocking.
  In-memory DB per test via `beforeEach(() => openTestDb())` /
  `afterEach(() => closeDb())` from `./db/index.js`.
- TS strict, ESM, `.js` import suffixes.
- Test files at `server/src/*.test.ts` (flat, next to `app.ts`).

## Scope

**In scope** (the only files you should modify):

- `server/src/auth/middleware.ts` (the seam — ~4 lines)
- `server/src/auth.boundary.test.ts` (create)

**Out of scope** (do NOT touch):

- `server/src/auth/routes.ts`, `server/src/auth/pin.ts` — behavior changes
  are plan 004.
- `app.set('trust proxy', false)` and the `LOOPBACK` set — the security
  properties under test.
- Client code, e2e specs.

## Git workflow

- Branch: `advisor/003-auth-boundary-tests`
- Commit style: short imperative summary (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the test-only remote-address seam

In `server/src/auth/middleware.ts`, change `isLoopback` to:

```ts
export function isLoopback(req: Request): boolean {
  // Test-only seam: vitest sets VITEST=true; production never runs under
  // it. Lets integration tests simulate a non-loopback peer, since
  // supertest always connects over loopback.
  const testOverride = process.env.VITEST ? req.headers['x-canopy-test-remote'] : undefined;
  const addr = typeof testOverride === 'string' ? testOverride : req.socket.remoteAddress;
  return LOOPBACK.has(addr ?? '');
}
```

Nothing else in the file changes.

**Verify**: `npm run typecheck` → exit 0; `npm test --workspace server` →
all existing tests still pass (no test sends the header yet).

### Step 2: Write the boundary tests

Create `server/src/auth.boundary.test.ts`. Setup mirrors
`phase1.test.ts` (`request`, `createApp`, `openTestDb`/`closeDb`). Use a
constant `const REMOTE = { 'x-canopy-test-remote': '192.168.1.50' };` and
apply it with `.set(REMOTE)`.

Test cases:

1. **Remote without a session is rejected on every feature router**: with a
   PIN configured (set it first WITHOUT the header — i.e. as the panel),
   `GET /api/settings`, `GET /api/users`, `GET /api/events?from=2026-07-01&to=2026-07-02`,
   `GET /api/backup`, and `POST /api/tasks` (any valid body) each return
   **401** with `code: 'unauthorized'` when sent with `.set(REMOTE)` and no
   cookie. (Looping over an array of `[method, path]` pairs is fine.)
2. **Remote pre-auth surface is exactly health + auth**:
   `GET /api/health` → 200 and `GET /api/auth/status` → 200 with
   `{ isPanel: false }`, both with `.set(REMOTE)` and no cookie.
3. **Remote with a valid session passes**: set PIN as panel → `POST
   /api/auth/login` with `.set(REMOTE)` and the correct PIN → 200 + cookie →
   `GET /api/settings` with `.set(REMOTE)` and that cookie → 200.
4. **Wrong PIN from remote gets 401 and no cookie**: assert
   `res.headers['set-cookie']` is undefined.
5. **Expired session is rejected**: call `createSession('test', -1)`
   (import from `./auth/pin.js`) to mint an expired token; send it as
   `Cookie: canopy_session=<token>` with `.set(REMOTE)` → 401.
6. **Logout invalidates the session for remote callers**: login as in (3),
   `POST /api/auth/logout` with the cookie, then `GET /api/settings` with
   the same cookie + `.set(REMOTE)` → 401.
7. **The seam is inert outside vitest**: not directly testable here — instead
   assert the guard exists: this case is covered by code review; skip.
   (Do not write a test that unsets `process.env.VITEST` mid-process —
   vitest sets it for the whole run and other tests depend on it.)
8. **No-PIN lockout**: with NO PIN configured, remote `GET /api/settings`
   (no cookie) → 401 — "until a PIN is configured, remote access is
   read-nothing" per the middleware doc comment.

Note on rate limiting: `POST /api/auth/login` is limited to 8 attempts per
15 min **per IP** (`server/src/auth/routes.ts:14-20`). The limiter keys on
`req.ip`, which still resolves to loopback for all supertest requests (the
seam only affects `isLoopback`), and the limiter is module-level state shared
across `createApp()` calls in one process. Keep total login/verify calls in
this file **under 8**, or the tail of the file will start seeing 429s. Count
your login attempts; currently cases 3, 4, 6 need ~4.

**Verify**: `npm test --workspace server` → all pass, including ≥7 new
tests in `auth.boundary.test.ts`.

### Step 3: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → all workspaces pass.

## Test plan

This plan IS the test plan (Step 2, 7 executable cases). Pattern:
`server/src/phase1.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `server/src/auth.boundary.test.ts` exists; ≥7 tests pass
- [ ] `grep -n "x-canopy-test-remote" server/src/auth/middleware.ts` → exactly one match, guarded by `process.env.VITEST`
- [ ] Existing test files unchanged (`git status --porcelain` touches only the two in-scope files plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `requireAuth`/`isLoopback` no longer match the excerpt (plan 004 may have
  landed first — coordinate; this plan is supposed to land BEFORE 004).
- Case 1 finds a feature route that returns 200 to an unauthenticated remote
  peer — that is a live vulnerability, not a test bug. Report it immediately
  with the route name; do not "fix" it inside this plan.
- The login rate limiter interferes despite staying under 8 attempts
  (indicates the limiter keys differently than analyzed).
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The `x-canopy-test-remote` seam must stay inside the
  `process.env.VITEST` guard. If the app ever gains a real reverse-proxy
  deployment mode (`trust proxy`), revisit `isLoopback` entirely.
- Plan 004 (PIN/email lockdown) builds directly on these tests and this
  seam — its brute-force and initial-PIN cases need `.set(REMOTE)`.
- Reviewer focus: case 1's route list should cover one route per mounted
  feature router if cheap to do so; at minimum the five listed.
