# Plan 001: Fix ICS recurring events — shifted times, inverted EXDATE matching, malformed RRULE strings

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 310da15..HEAD -- server/src/services/icsFeed.ts server/src/services/eventCache.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `310da15`, 2026-07-15

## Why this matters

Canopy is a wall-mounted family calendar. Subscribed ICS feeds (school and
sports calendars) are one of its two event sources. Three bugs in
`server/src/services/icsFeed.ts` make recurring feed events wrong:

1. **Recurring event times are shifted by the UTC offset** (5–6 hours early
   for a family in America/Chicago). A weekly 8:00 PM practice renders at
   3:00 PM.
2. **Cancelled occurrences (EXDATE) are matched against the wrong day** — the
   cancelled instance still shows, and an unrelated adjacent day's instance is
   silently hidden.
3. **The recurrence rule string is emitted with a doubled prefix**
   (`RRULE:RRULE:FREQ=...`), so the client's rule describer throws internally
   and every recurring feed event shows the fallback text "Repeats (custom
   rule)" instead of e.g. "every week on Monday".

All three were empirically reproduced against this repo's installed
`node-ical` (see "Verified library behavior" below — the fix relies on it).

## Current state

Relevant files:

- `server/src/services/icsFeed.ts` — fetches and parses ICS feeds; contains
  all three bugs (lines 41–105). This is the file you will change.
- `server/src/services/eventCache.ts` — calls `parseIcsEvents` via the `ics`
  fetcher (lines 119–122) and normalizes results in `normalizeIcsEvent`
  (lines 83–105). **Read it, don't change it.**
- `client/src/features/calendar/recurrence.ts` — `describeRrule` /
  `rruleToPreset` parse the `rrule` string with the `rrule` package's
  `rrulestr`; a malformed string lands in the `catch` → "Repeats (custom
  rule)". **Out of scope, no change needed** — fixing the string server-side
  fixes the display.

The buggy block, `server/src/services/icsFeed.ts:57-90` as written today:

```ts
    if (ev.rrule) {
      const overridden = new Set(
        Object.keys(ev.recurrences ?? {}), // ISO date strings of overridden instances
      );
      for (const occ of ev.rrule.between(windowStart, windowEnd, true)) {
        const key = occ.toISOString().slice(0, 10);
        if (ev.exdate && Object.keys(ev.exdate).some((d) => d.startsWith(key))) continue;
        if (overridden.has(key)) continue;
        out.push({
          uid: `${ev.uid}:${occ.toISOString()}`,
          title: ev.summary ?? '(untitled)',
          allDay,
          start: occ,
          end: new Date(occ.getTime() + durationMs),
          location: ev.location || undefined,
          description: ev.description || undefined,
          rrule: `RRULE:${ev.rrule.toString().split('\n').pop() ?? ''}`,
        });
      }
      // Overridden instances (moved occurrences) come through as their own entries.
      for (const override of Object.values(ev.recurrences ?? {})) {
        const o = override as VEvent;
        if (o.start >= windowStart && o.start <= windowEnd) {
          ...
```

Defects, mapped to that excerpt:

- `start: occ` — `occ` is **not a real instant** (see frame table below);
  using it directly shifts every recurring occurrence.
- `occ.toISOString().slice(0, 10)` compared against `Object.keys(ev.exdate)`
  — the two sides are in **different frames**, so the wrong date matches.
- `` `RRULE:${ev.rrule.toString().split('\n').pop() ?? ''}` `` — the last
  line of `rrule.toString()` **already starts with `RRULE:`**, producing
  `RRULE:RRULE:FREQ=...`.

## Verified library behavior (empirical, this repo's node-ical ^0.20.1)

Reproduced on 2026-07-15 with `TZ=America/Chicago`, DTSTART
`20260701T200000` (8 PM) under various zone forms, `RRULE:FREQ=DAILY`:

| DTSTART form | `ev.rrule.origOptions.tzid` | `ev.start` (real instant) | first `rrule.between()` occurrence |
|---|---|---|---|
| `;TZID=America/Chicago:` | `America/Chicago` | `2026-07-02T01:00:00Z` | `2026-07-01T20:00:00Z` |
| `;TZID=America/New_York:` | `America/New_York` | `2026-07-02T00:00:00Z` | `2026-07-01T19:00:00Z` |
| `;TZID=Europe/London:` | `Europe/London` | `2026-07-01T19:00:00Z` | `2026-07-01T14:00:00Z` |
| `...T200000Z` (UTC) | `Etc/UTC` | `2026-07-01T20:00:00Z` | `2026-07-01T15:00:00Z` |
| `...T200000` (floating) | `undefined` | `2026-07-02T01:00:00Z` | `2026-07-02T01:00:00Z` |

**The rule that falls out (this is the crux of the fix):**

- When `ev.rrule.origOptions.tzid` is **set** (any zone, including
  `Etc/UTC`): `between()` returns Dates whose **UTC fields hold the
  occurrence's wall-clock time in the server's local zone**. The real
  instant is recovered with the plain local-zone Date constructor:

  ```ts
  new Date(occ.getUTCFullYear(), occ.getUTCMonth(), occ.getUTCDate(),
           occ.getUTCHours(), occ.getUTCMinutes(), occ.getUTCSeconds())
  ```

  (Check every row: Chicago 20:00Z-fields → 8 PM local = `01:00Z` ✓;
  London 14:00Z-fields → 2 PM local = `19:00Z` ✓; Etc/UTC 15:00Z-fields →
  3 PM local = `20:00Z` ✓. The engine's DST tables make this correct across
  CDT/CST transitions.)

- When `tzid` is **undefined** (floating local time): occurrences are
  already real instants. No conversion.

- EXDATE entries: `ev.exdate` is an object whose **values are real-instant
  `Date`s** (verified: `EXDATE;TZID=America/Chicago:20260703T200000` →
  value `2026-07-04T01:00:00.000Z`) and whose keys are UTC date strings of
  those instants — which is why key-vs-occurrence string matching inverts.
  Match on **instants**, not strings.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0, no output errors |
| Server tests | `npm test --workspace server` | all pass |
| All tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

Known environment trap: if server tests fail at import with
`NODE_MODULE_VERSION ... better_sqlite3.node`, your shell's Node version
differs from the one that compiled the native module. Run
`npm rebuild better-sqlite3` once (use Node 20 or 22 — CI uses 22). This is
an environment fix, not a code change.

## Repo conventions that apply

- TypeScript strict, ESM; **server imports use explicit `.js` suffixes**
  (`import { toDateKey } from '@canopy/shared'` for the shared workspace,
  relative `../db/index.js` style otherwise). Match `eventCache.ts`.
- Tests: Vitest. Server test scripts pin `TZ=America/Chicago` (in
  `server/package.json` — do not add TZ handling inside tests). Pure-logic
  tests need no DB; see `server/src/phase2.test.ts` `describe('parseIcsEvents')`
  style — fixture ICS strings built with `[...].join('\r\n')`.
- Comment style: sparse, explaining *why*/constraints only.

## Scope

**In scope** (the only files you should modify):

- `server/src/services/icsFeed.ts`
- `server/src/icsFeed.test.ts` (create — pure unit tests, no DB needed)

**Out of scope** (do NOT touch, even though they look related):

- `server/src/services/eventCache.ts` — `normalizeIcsEvent` is correct once
  it receives real instants; its own tests cover it.
- `client/src/features/calendar/recurrence.ts` and any client file — the
  client is correct; it was fed a malformed string.
- SSRF/size hardening of `fetchIcsText` — that is plan 002; do not combine.
- `node-ical` version bump — out of scope; the fix must work on ^0.20.1.

## Git workflow

- Branch: `advisor/001-fix-ics-recurrence` (repo has no branch convention on
  record; main is the integration branch).
- Commit style: short imperative summary, e.g. `Fix ICS recurrence: real
  instants, instant-based EXDATE matching, single RRULE prefix` (match
  `git log --oneline` tone).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm the library behavior table on your machine

Run this exact probe from the repo root:

```bash
TZ=America/Chicago node -e "
import('./node_modules/node-ical/node-ical.js').then(m => {
const ical = m.default;
const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//x//EN','BEGIN:VEVENT','UID:r1','DTSTART;TZID=America/Chicago:20260701T200000','DTEND;TZID=America/Chicago:20260701T210000','RRULE:FREQ=DAILY;COUNT=3','EXDATE;TZID=America/Chicago:20260702T200000','SUMMARY:E','END:VEVENT','END:VCALENDAR'].join('\r\n');
const ev = Object.values(ical.sync.parseICS(ics)).find(c=>c.type==='VEVENT');
console.log('tzid', ev.rrule.origOptions.tzid);
console.log('occ0', ev.rrule.between(new Date('2026-06-01'), new Date('2026-08-01'), true)[0].toISOString());
console.log('exdate values', Object.values(ev.exdate).map(d=>d.toISOString()));
});"
```

**Verify**: output shows `tzid America/Chicago`, `occ0 2026-07-01T20:00:00.000Z`,
and exdate value `2026-07-03T01:00:00.000Z`. If any differ, STOP (the
installed node-ical behaves differently than this plan assumes).

### Step 1: Write the failing tests

Create `server/src/icsFeed.test.ts` importing only
`{ parseIcsEvents } from './services/icsFeed.js'` (keeps the file DB-free).
Build fixtures as `\r\n`-joined arrays. Include a VTIMEZONE-free TZID form —
node-ical resolves IANA TZIDs without VTIMEZONE blocks. Cases (all under the
script's pinned `TZ=America/Chicago`; window
`parseIcsEvents(ics, new Date('2026-06-01T00:00:00'), new Date('2026-12-31T00:00:00'))`):

1. **Timed recurring TZID event has correct instants**: daily 8 PM
   `DTSTART;TZID=America/Chicago:20260701T200000`, `DTEND` 9 PM, `COUNT=3` →
   3 events; first `start.toISOString()` is `2026-07-02T01:00:00.000Z`
   (8 PM CDT), each `end - start` is exactly 3 600 000 ms.
2. **EXDATE cancels exactly the named occurrence**: same event with
   `EXDATE;TZID=America/Chicago:20260702T200000` → 2 events, and none has
   `start.toISOString() === '2026-07-03T01:00:00.000Z'`, while the July 1
   and July 3 (local) occurrences remain.
3. **UTC DTSTART recurring event has correct instants**:
   `DTSTART:20260701T200000Z`, `COUNT=2` → first start `2026-07-01T20:00:00.000Z`.
4. **Fall-back DST boundary keeps wall-clock time**: daily 8 PM Chicago event
   spanning 2026-10-31 → 2026-11-02 (CDT→CST on Nov 1): the occurrence on
   Nov 1 has start `2026-11-02T02:00:00.000Z` (8 PM CST), Oct 31 has
   `2026-11-01T01:00:00.000Z` (8 PM CDT).
5. **Overridden instance emitted once**: event with a `RECURRENCE-ID`
   override that moves one occurrence → the moved instance appears exactly
   once (at its new time) and the original slot is absent.
6. **RRULE string round-trips**: every returned recurring event's `rrule`
   matches `/^RRULE:FREQ=/` and does NOT contain `RRULE:RRULE`; additionally
   `rrulestr(event.rrule)` (import `{ rrulestr } from 'rrule'` — already a
   transitive dep of node-ical; if that import fails in the server workspace,
   assert on the string shape only) does not throw.
7. **Non-recurring events unaffected**: a plain timed event keeps
   `ev.start`-based instants (guards against regressing the non-rrule branch).

**Verify**: `npm test --workspace server` → the new tests FAIL (tests 1, 2,
4, 5, 6 fail against current code; 3 may fail; 7 passes). Existing tests
still pass.

### Step 2: Fix `parseIcsEvents`

In `server/src/services/icsFeed.ts`, inside the `if (ev.rrule)` branch:

1. Add a frame-correcting converter near the top of the file:

   ```ts
   /**
    * node-ical returns rrule occurrences with the real instant's
    * server-local wall clock stored in the Date's UTC fields whenever the
    * event carries a TZID (see plans/001 frame table). Rebuild the instant
    * through the local-zone Date constructor; floating events (no tzid)
    * are already real instants.
    */
   function occurrenceInstant(occ: Date, tzid: string | undefined): Date {
     if (!tzid) return occ;
     return new Date(
       occ.getUTCFullYear(), occ.getUTCMonth(), occ.getUTCDate(),
       occ.getUTCHours(), occ.getUTCMinutes(), occ.getUTCSeconds(),
     );
   }
   ```

2. Read `const tzid = ev.rrule.origOptions.tzid ?? undefined;` (it is typed
   `string | null | undefined` — normalize null to undefined).

3. Widen the expansion window by one day on each side before calling
   `between` (the floating frame skews boundaries by up to the UTC offset),
   then filter by **real** instant:

   ```ts
   const expandStart = new Date(windowStart.getTime() - 86_400_000);
   const expandEnd = new Date(windowEnd.getTime() + 86_400_000);
   for (const occ of ev.rrule.between(expandStart, expandEnd, true)) {
     const start = occurrenceInstant(occ, tzid);
     if (start > windowEnd || start < windowStart) continue;
     ...
   ```

   (A fixed ±86 400 000 ms widen is safe here: it is deliberate slack on an
   *exclusive expansion* window, not day arithmetic — occurrences are then
   filtered by real instant.)

4. Replace the string-keyed exclusion with instant matching, built once per
   event before the loop:

   ```ts
   const exdateInstants = new Set(
     Object.values(ev.exdate ?? {}).map((d) => (d as Date).getTime()),
   );
   const overrideInstants = new Set(
     Object.values(ev.recurrences ?? {}).map((o) => {
       const r = (o as VEvent & { recurrenceid?: Date }).recurrenceid;
       return (r ?? (o as VEvent).start).getTime();
     }),
   );
   ```

   and in the loop: `if (exdateInstants.has(start.getTime())) continue;` and
   `if (overrideInstants.has(start.getTime())) continue;`.

   **All-day recurring events** (`allDay === true`): exdate values and
   occurrences are date-only; compare by local date key instead of epoch ms —
   use `toDateKey` from `@canopy/shared` on both sides (build a
   `Set<string>` of `toDateKey(d)` when `allDay`). Import
   `{ toDateKey } from '@canopy/shared'`.

5. Use the real instant in the emitted event:
   `uid: \`${ev.uid}:${start.toISOString()}\``, `start`,
   `end: new Date(start.getTime() + durationMs)`.

6. Fix the rrule string:

   ```ts
   const ruleLine = ev.rrule.toString().split('\n').pop() ?? '';
   ...
   rrule: ruleLine.startsWith('RRULE:') ? ruleLine : `RRULE:${ruleLine}`,
   ```

7. The override-emission loop (`for (const override of ...)`) already uses
   real `o.start` instants — keep it, but note its window check now uses the
   same `windowStart`/`windowEnd` (unwidened) bounds. Leave its behavior
   otherwise unchanged.

**Verify**: `npm test --workspace server` → all tests pass, including the 7
new ones.

### Step 3: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → all workspaces pass.
`npm run build` → exit 0.
`grep -c 'RRULE:\${' server/src/services/icsFeed.ts` → `0` matches for the
old doubled-prefix template (the new conditional template is fine; the grep
target is the exact old string `` `RRULE:${ev.rrule.toString()`` — check with
`grep -n 'RRULE:\${ev.rrule' server/src/services/icsFeed.ts` → no output).

## Test plan

Covered by Step 1 (7 cases). Structural pattern:
`server/src/phase2.test.ts` (`describe('parseIcsEvents')` block, fixture
style). Verification: `npm test --workspace server` → all pass, ≥7 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `server/src/icsFeed.test.ts` exists with ≥7 tests
- [ ] `grep -n 'RRULE:\${ev.rrule' server/src/services/icsFeed.ts` → no output
- [ ] `grep -n 'toISOString().slice(0, 10)' server/src/services/icsFeed.ts` → no output
- [ ] `git status --porcelain` shows changes only to the two in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 0's probe output differs from the expected values (node-ical version
  or behavior drifted — the whole frame table is then unverified).
- `ev.recurrences` values turn out not to carry a usable `recurrenceid`/`start`
  real-instant Date (Step 2.4 assumption).
- Existing `phase2.test.ts` ICS tests fail after your change — they encode
  current end-exclusive/endKey behavior via `normalizeIcsEvent`; a conflict
  means the fix changed more than the occurrence frame.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The frame table is **node-ical-version-specific**. If `node-ical` is ever
  bumped (a separate maintenance item — see plans/README.md backlog), re-run
  Step 0's probe and the icsFeed test suite before merging; the
  `occurrenceInstant` shim may become unnecessary or wrong.
- Plan 002 (feed hardening) edits the same file — land this first.
- Reviewer focus: the all-day vs timed exclusion split, and DST cases in
  test 4 — those encode the intended semantics.
- Known accepted limitation: for feeds whose events live in a *different*
  zone than the panel, wall-clock display follows the panel's zone (correct
  instants, panel-local rendering) — same as Google events.
