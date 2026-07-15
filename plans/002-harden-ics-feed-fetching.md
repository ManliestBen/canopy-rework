# Plan 002: Harden ICS feed fetching — SSRF guard, size/expansion caps, sanitized errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 310da15..HEAD -- server/src/services/icsFeed.ts server/src/services/eventCache.ts server/src/routes/calendars.ts`
> Plan 001 intentionally changes `icsFeed.ts` before this plan runs — that
> diff is expected. Compare the excerpts below against the live code; only a
> mismatch in the *fetching* code paths (not the recurrence expansion) is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-fix-ics-recurring-event-times-and-exclusions.md (same file; land 001 first)
- **Category**: security
- **Planned at**: commit `310da15`, 2026-07-15

## Why this matters

Canopy's server fetches user-supplied ICS calendar URLs — at save time
(verify endpoint) and then **forever on a 5-minute background timer**. Today
that fetch accepts any URL, follows redirects freely, reads an unbounded
response body, and expands recurrence rules without limits. Combined, an
authenticated device on the LAN (or a compromised feed) can:

- make the server probe internal/loopback HTTP services and read
  success/failure signals back (SSRF — the verify response and the cached
  per-calendar `error` field reflect outcomes);
- feed a pathological ICS body (huge, or with a per-minute recurrence rule
  over the ~166-day cache window) that blocks the single-process event loop
  and exhausts memory on the Raspberry Pi (DoS).

The upstream error text is also stored verbatim and served to clients via
`GET /api/events`, which leaks internal hostnames/status detail and makes
blind probes informative.

## Current state

Relevant files:

- `server/src/services/icsFeed.ts` — `fetchIcsText` (the unguarded fetch)
  and `parseIcsEvents` (the unbounded expansion). Main file to change.
  `fetchIcsText` today (`icsFeed.ts:21-31`):

  ```ts
  export async function fetchIcsText(url: string): Promise<string> {
    // Accept webcal:// (Apple convention) by translating to https.
    const httpUrl = url.replace(/^webcal:\/\//i, 'https://');
    const res = await fetch(httpUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'Canopy/1.0 (family calendar panel)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Feed responded ${res.status}`);
    return res.text();
  }
  ```

- `server/src/routes/calendars.ts:41-61` — `POST /api/calendars/verify`
  passes `sourceRef` (zod: `z.string().trim().min(3).max(500)`) into
  `fetchIcsText`; its catch already returns the generic
  `'Could not fetch that URL.'` — good, keep that.
- `server/src/services/eventCache.ts:135-161` — `refreshCalendar` calls the
  ICS fetcher on the background interval and, on failure, stores
  `err.message` verbatim into the cache entry's `error` field
  (`eventCache.ts:150-159`), which `getEvents` returns to clients
  (`eventCache.ts:227`).
- Window size context: `WINDOW_BEHIND_DAYS = 45`, `WINDOW_AHEAD_DAYS = 120`
  (`eventCache.ts:23-24`) — the expansion window is ~166 days.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Server tests | `npm test --workspace server` | all pass |
| All tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

If server tests fail at import with `NODE_MODULE_VERSION ...
better_sqlite3.node`, run `npm rebuild better-sqlite3` once (Node 20/22).

## Repo conventions that apply

- TypeScript strict, ESM, `.js` import suffixes on the server.
- Expected-failure errors carry a status: `throw Object.assign(new Error('...'), { status: 502 })`
  (see `server/src/services/users.ts` for the idiom).
- Logging via `import { logger } from '../logger.js'` (pino) — detail goes to
  logs, generic text to clients.
- Pure-logic tests need no DB; model on `server/src/icsFeed.test.ts`
  (created by plan 001).

## Scope

**In scope** (the only files you should modify):

- `server/src/services/icsFeed.ts`
- `server/src/services/eventCache.ts` (error-message sanitization only)
- `server/src/icsFeed.test.ts` (extend)

**Out of scope** (do NOT touch):

- `server/src/routes/calendars.ts` — its verify catch is already generic.
- `server/src/services/weather.ts` / `photos.ts` — they have a similar
  stored-error pattern (backlog item SEC-05 in `plans/README.md`), but their
  URLs are operator-configured, not user-supplied; keep this plan scoped.
- Any auth/rate-limit change (that is plan 004).
- The recurrence *correctness* logic from plan 001 — don't rework it.

## Git workflow

- Branch: `advisor/002-harden-ics-fetching`
- Commit style: short imperative summary (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a URL guard and bounded body read to `fetchIcsText`

In `server/src/services/icsFeed.ts`:

1. Constants: `MAX_BODY_BYTES = 5 * 1024 * 1024`, `MAX_REDIRECTS = 3`.
2. Add `assertPublicHttpUrl(raw: string): URL`:
   - `new URL(raw)` (after the existing webcal→https rewrite); reject
     protocols other than `http:`/`https:`.
   - Resolve the hostname with `const { lookup } = await import('node:dns/promises')`
     — top-level `import { lookup } from 'node:dns/promises'` is fine too —
     using `lookup(hostname, { all: true })`, and reject if **any** resolved
     address is non-public. Also short-circuit reject hostnames that are
     already IP literals in those ranges, and the hostname `localhost`.
   - Non-public IPv4: `0.*`, `10.*`, `127.*`, `169.254.*`, `172.16.*`–`172.31.*`,
     `192.168.*`. Non-public IPv6: `::1`, `::`, `fc00::/7` (`fc`/`fd` prefix),
     `fe80::/10`, and IPv4-mapped `::ffff:a.b.c.d` (re-check the embedded
     IPv4). Implement as a small pure `isPublicAddress(addr: string): boolean`
     — exported for tests.
   - On rejection: `throw Object.assign(new Error('Feed URL is not allowed'), { status: 400, safe: true })`.
3. Replace `redirect: 'follow'` with a manual loop: fetch with
   `redirect: 'manual'`; on 301/302/303/307/308, resolve the `location`
   header against the current URL, run `assertPublicHttpUrl` on it, and loop
   (max `MAX_REDIRECTS`, else throw a `safe` 502 `'Feed redirected too many times'`).
4. Bound the body: prefer streaming —
   ```ts
   const reader = res.body?.getReader();
   ```
   accumulate chunks, abort with a `safe` 502 `'Feed too large'` once total
   bytes exceed `MAX_BODY_BYTES`. If `content-length` is present and already
   over the cap, fail before reading.
5. Keep the existing 10 s `AbortSignal.timeout` and User-Agent.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Cap recurrence expansion in `parseIcsEvents`

1. Constants: `MAX_OCCURRENCES_PER_EVENT = 1000`,
   `MAX_EVENTS_PER_FEED = 5000`.
2. In the rrule branch, stop consuming occurrences for an event beyond the
   per-event cap; stop processing the feed entirely once `out.length`
   reaches the per-feed cap. When either cap trips, log once per parse:
   `logger.warn({ uid: ev.uid }, 'ics feed truncated at expansion cap')`
   (import `logger` — this makes the truncation observable rather than
   silent; the pure function may instead *return* a `truncated` flag if you
   prefer to keep it log-free — either is acceptable, but the event must be
   observable server-side).
3. `ical.sync.parseICS` still parses the whole text — the byte cap from
   Step 1 is what bounds it; no change needed here.

**Verify**: `npm test --workspace server` → existing icsFeed tests still pass.

### Step 3: Sanitize stored refresh errors in `eventCache.ts`

In `refreshCalendar`'s catch (`eventCache.ts:150-159`): keep logging the raw
message (already done), but store a generic string in the cache entry:

```ts
const safe = (err as { safe?: boolean }).safe === true;
const message = err instanceof Error && safe ? err.message : 'Could not refresh this calendar';
```

Errors thrown with `safe: true` (from Step 1) are our own wording and may be
shown; anything else (network stack, node-ical, Google client) becomes the
generic string. This applies to both google and ics sources — Google client
errors also currently flow verbatim into the client-visible field.

**Verify**: `npm test --workspace server` → all pass (`phase2.test.ts` has a
refresh-failure test — if it asserts on a specific error message, update the
assertion to the new generic string; that assertion change is in scope).

### Step 4: Tests

Extend `server/src/icsFeed.test.ts`:

1. `isPublicAddress` unit cases: rejects `127.0.0.1`, `10.0.0.8`,
   `172.20.1.1`, `192.168.1.10`, `169.254.1.1`, `::1`, `fd00::1`,
   `::ffff:192.168.1.10`; accepts `93.184.216.34`, `2606:2800:220:1:248:1893:25c8:1946`.
2. `fetchIcsText` rejects `ftp://example.com/cal.ics`,
   `http://localhost/cal.ics`, `http://127.0.0.1/cal.ics`,
   `http://192.168.1.1/cal.ics` — each throws with `status: 400` **without
   any network call** (IP-literal/localhost short-circuit; no mocking needed).
3. Body cap: mock global fetch (`vi.stubGlobal('fetch', ...)`) returning a
   `Response` with > 5 MB body (or a `content-length` header over the cap) →
   throws `Feed too large`.
4. Redirect guard: mocked fetch returning a 302 with
   `location: http://127.0.0.1/x` → rejected; 4 chained public redirects →
   `Feed redirected too many times`.
5. Expansion cap: fixture with `RRULE:FREQ=MINUTELY` (no COUNT/UNTIL) over
   the plan-001 test window → returned events for that UID ≤ 1000, and the
   parse completes in bounded time.

**Verify**: `npm test --workspace server` → all pass, ≥5 new tests.
`npm run typecheck` → exit 0. `npm test` → all workspaces pass.

## Test plan

Covered in Step 4. Pattern: existing `server/src/icsFeed.test.ts` (plan 001)
for fixtures; `vi.stubGlobal('fetch', ...)` for network mocks (restore in
`afterEach` with `vi.unstubAllGlobals()`).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` exits 0
- [ ] `grep -n "redirect: 'follow'" server/src/services/icsFeed.ts` → no output
- [ ] `grep -n "MAX_BODY_BYTES\|MAX_OCCURRENCES_PER_EVENT" server/src/services/icsFeed.ts` → both present
- [ ] `grep -n "Could not refresh this calendar" server/src/services/eventCache.ts` → present
- [ ] `git status --porcelain` shows changes only to in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 001 has not landed (its status row in `plans/README.md` is not DONE)
  — this plan edits the same functions.
- `parseIcsEvents`'s shape after plan 001 differs materially from what
  Step 2 assumes (no rrule branch loop to cap).
- Applying the cap requires touching `eventCache.ts` beyond the error-string
  change in Step 3.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Residual risk accepted**: DNS-rebinding (resolve-then-connect re-resolution)
  is not fully closed — doing so requires connecting to the resolved IP with
  a pinned Host/SNI. For a LAN family panel this was judged out of proportion;
  revisit if the panel is ever exposed beyond the LAN.
- If a family legitimately needs an *internal* ICS URL (e.g. a NAS-hosted
  calendar), add an explicit allowlist setting rather than weakening the
  guard.
- Weather/photos services still store raw upstream error text (lower risk,
  operator-configured URLs) — backlog SEC-05 in `plans/README.md`.
- Reviewer focus: the IPv6/IPv4-mapped cases in `isPublicAddress`, and that
  the manual-redirect loop can't be bypassed by a relative `location`.
