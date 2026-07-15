# Plan 005: Stop the minute clock from re-rendering the whole calendar tree

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 310da15..HEAD -- client/src/hooks/useNow.ts client/src/app/Header.tsx client/src/features/calendar/CalendarPage.tsx client/src/features/calendar/TimeGridView.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `310da15`, 2026-07-15

## Why this matters

Canopy runs 24/7 on a Raspberry Pi. The `useNow()` hook re-renders its host
component every minute (to roll "today" over at midnight and update the
clock). It is currently called in three components that each span the default
`/calendar` route's visible tree: `Header`, `CalendarPage`, and
`TimeGridView`. So once a minute, forever, the entire calendar subtree
reconciles — and in `TimeGridView` the only value actually needed from the
tick is the "now" line position. On a low-power Pi this is ~1,440
full-subtree diffs per day of pure waste. Moving the tick into small leaf
components keeps the midnight-rollover and clock behavior identical while
letting the heavy tree stay static between real data changes.

## Current state

`client/src/hooks/useNow.ts` — ticks on the minute (correct, keep it):

```ts
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      timeout = setTimeout(() => { setNow(new Date()); schedule(); }, msToNextMinute);
    };
    schedule();
    return () => clearTimeout(timeout);
  }, []);
  return now;
}
```

Three heavy call sites:

- `client/src/app/Header.tsx:12-38` — uses `now` only for two `format(now, …)`
  strings (the clock `h:mm a` and the date `EEEE, MMMM d`). Everything else
  in the header (family name, weather, members, buttons) is tick-independent.
- `client/src/features/calendar/CalendarPage.tsx:37-40`:
  ```ts
  const now = useNow();
  const todayKey = computeTodayKey();
  void now; // ticking re-render keeps todayKey fresh past midnight
  ```
  The tick is used **only** to recompute `todayKey` after midnight; `now`
  itself is discarded (`void now`). This whole page (view switcher, all
  view renderers) re-renders each minute for one string.
- `client/src/features/calendar/TimeGridView.tsx:42,59` — `const now = useNow()`
  then `const nowMinutes = now.getHours() * 60 + now.getMinutes()`, used to
  place the now-line. The 24h grid, day headers, banners, and per-day event
  layout all re-render each minute for that one number.
  - Bonus in the same file: the day-header event count
    (`TimeGridView.tsx:68`, `events.filter(...)` inside the `days.map`) is
    recomputed every render, unlike the memoized `banners`/`timed`/`perDay`
    above it.

There is no existing "today" context; `computeTodayKey()` is a pure helper
imported in `CalendarPage`. Other components also call `useNow()`
(`MealsPage`, `ChoresPage`, `TasksPage`, `Slideshow`, `EventReminders`,
`useScreensaver`) — **those are out of scope**; this plan only fixes the
three calendar-tree offenders.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `npm ci` (repo root) | exit 0 |
| Typecheck | `npm run typecheck` | exit 0 |
| Client tests | `npm test --workspace client` | all pass |
| All tests | `npm test` | all pass |
| Build | `npm run build` | exit 0 |

(Client tests use happy-dom + Testing Library; no native module issues.)

## Repo conventions that apply

- React 18 function components, TS strict, ESM. Client imports do NOT use
  `.js` suffixes (Vite resolves) — match neighboring files.
- Small presentational components live beside their feature or in
  `client/src/components/`. Match the existing `MemberChip`/`WeatherChip`
  pattern (`client/src/components/`, `client/src/features/weather/`).
- Tests: `client/src/**/*.test.tsx?`; see
  `client/src/features/calendar/layout.test.ts` and
  `client/src/app/App.test.tsx` for style.

## Scope

**In scope**:

- `client/src/app/Header.tsx`
- `client/src/features/calendar/CalendarPage.tsx`
- `client/src/features/calendar/TimeGridView.tsx`
- `client/src/components/HeaderClock.tsx` (create)
- `client/src/components/NowLine.tsx` (create) — or co-locate in the
  calendar feature dir; either is fine, keep it a leaf.
- One test file (create `client/src/features/calendar/clock-isolation.test.tsx`
  or extend an existing calendar test).

**Out of scope** (do NOT touch):

- `client/src/hooks/useNow.ts` — the hook is correct; do not change its
  timing.
- Every other `useNow()` caller (`MealsPage`, `ChoresPage`, `TasksPage`,
  `Slideshow`, `EventReminders`, `useScreensaver`) — separate concerns; some
  legitimately need the whole component to re-render (e.g. reminders firing).
- `React.memo` sweeps across unrelated components.
- The midnight-rollover *timing* semantics — behavior must be identical, just
  scoped to smaller components.

## Git workflow

- Branch: `advisor/005-isolate-clock-rerenders`
- Commit style: short imperative summary (match `git log --oneline`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract `HeaderClock`

Create `client/src/components/HeaderClock.tsx`: a leaf that calls `useNow()`
and renders exactly the two elements currently in `Header`:

```tsx
import { format } from 'date-fns';
import { useNow } from '../hooks/useNow';

export function HeaderClock() {
  const now = useNow();
  return (
    <>
      <div className="header-clock" aria-live="off">{format(now, 'h:mm a')}</div>
      <div className="header-date">{format(now, 'EEEE, MMMM d')}</div>
    </>
  );
}
```

In `Header.tsx`: remove `useNow`, the `now` variable, and the `date-fns`
`format` import if now unused; replace the two clock/date `<div>`s with
`<HeaderClock />`. The header no longer ticks.

**Verify**: `npm run typecheck` → exit 0. Visually confirm the JSX order is
unchanged (clock then date, both before `header-spacer`).

### Step 2: Give `CalendarPage` a non-ticking `todayKey`

`CalendarPage` needs `todayKey` to advance at midnight but must not re-render
its whole body each minute. Use a narrow state that only changes when the day
key actually changes:

```tsx
// replaces: const now = useNow(); const todayKey = computeTodayKey(); void now;
const [todayKey, setTodayKey] = useState(computeTodayKey);
useEffect(() => {
  const id = setInterval(() => {
    setTodayKey((prev) => {
      const next = computeTodayKey();
      return next === prev ? prev : next; // referential no-op except at rollover
    });
  }, 60_000);
  return () => clearInterval(id);
}, []);
```

Because `setTodayKey` returns the same string on every tick except the one
crossing midnight, React bails out of the re-render on all no-op ticks. The
page re-renders once, at rollover — exactly the intended behavior.

Remove the now-unused `useNow` import if nothing else in the file uses it
(check first).

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Extract `NowLine` in `TimeGridView`

The now-line is an absolutely-positioned element driven by `nowMinutes`.
Move the tick into a leaf:

1. Create `client/src/components/NowLine.tsx` (or co-locate):

   ```tsx
   import { useNow } from '../hooks/useNow';
   // HOUR_PX is defined in TimeGridView; export it from there and import it,
   // or pass the pixels-per-minute as a prop. Prefer a prop to avoid a
   // circular import:
   export function NowLine({ pxPerMinute }: { pxPerMinute: number }) {
     const now = useNow();
     const nowMinutes = now.getHours() * 60 + now.getMinutes();
     return <div className="timegrid-nowline" style={{ top: nowMinutes * pxPerMinute }} />;
   }
   ```

   Match the exact class name and positioning the current now-line uses —
   **find it in `TimeGridView.tsx` first** (search for where `nowMinutes` is
   consumed in JSX) and replicate its markup/style precisely, including any
   `today`/current-day guard so it only shows on the correct column.

2. In `TimeGridView.tsx`: remove `const now = useNow()` and
   `const nowMinutes = ...`; render `<NowLine pxPerMinute={HOUR_PX / 60} />`
   where the now-line markup was. Remove the `useNow` import.

3. Memoize the day-header count so the static grid doesn't recompute it each
   render: replace the inline `events.filter(...)` (`TimeGridView.tsx:68`)
   with a `useMemo` map keyed by day, e.g.
   ```tsx
   const countByDay = useMemo(() => {
     const m = new Map<string, number>();
     for (const day of days) m.set(day, events.filter((e) => e.startKey <= day && e.endKey >= day).length);
     return m;
   }, [events, days]);
   ```
   and read `countByDay.get(day) ?? 0` in the header.

**Verify**: `npm run typecheck` → exit 0. `npm test --workspace client` →
existing calendar tests pass.

### Step 4: Regression test — parents don't re-render on tick

Add `client/src/features/calendar/clock-isolation.test.tsx` using fake
timers to prove the isolation:

- Render a tiny harness: a parent component that calls a render-counter,
  wrapping `<HeaderClock />` (or `<NowLine pxPerMinute={1} />`).
- With `vi.useFakeTimers()`, mount, record the parent's render count, advance
  `vi.advanceTimersByTime(60_000)` (wrapped in `act`), and assert the parent
  render count is unchanged while the clock's displayed text advanced.
- Also assert `HeaderClock` renders a plausible `h:mm a` string initially.

Model timer/act usage on any existing test that uses `@testing-library/react`
(`client/src/app/App.test.tsx`). If fake-timer interplay with `useNow`'s
`setTimeout` scheduling proves fiddly, it is acceptable to instead assert the
narrower fact that `HeaderClock`/`NowLine` are standalone components that call
`useNow` and `CalendarPage`/`Header` no longer import `useNow` — but attempt
the render-count test first.

**Verify**: `npm test --workspace client` → all pass including the new test.

### Step 5: Full verification

**Verify**: `npm run typecheck` → exit 0. `npm test` → all workspaces pass.
`npm run build` → exit 0.

## Test plan

Step 4 (render-isolation regression). Structural pattern:
`client/src/app/App.test.tsx`. The behavioral guarantee: clock/now-line still
update each minute; parents don't re-render except at midnight rollover.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` exits 0; `npm run build` exits 0
- [ ] `grep -rn "useNow" client/src/app/Header.tsx client/src/features/calendar/CalendarPage.tsx client/src/features/calendar/TimeGridView.tsx` → no output (none of the three import it anymore)
- [ ] `client/src/components/HeaderClock.tsx` and the now-line leaf component exist and call `useNow`
- [ ] New isolation test exists and passes
- [ ] `git status --porcelain` shows only in-scope files (plus `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The now-line markup in `TimeGridView` is structurally entangled with the
  grid such that extracting it changes layout (e.g. it relies on being a
  sibling with specific CSS) — report what you found before forcing it.
- `HOUR_PX` cannot be cleanly shared without a circular import and passing it
  as a prop changes the computed position.
- Any existing calendar test starts failing in a way that indicates behavior
  (not just render count) changed.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- If a future change needs the *whole* header or calendar page to react to
  the minute tick (unlikely), that reintroduces the cost — prefer another
  leaf.
- The same leaf-extraction pattern applies to the other `useNow` callers if
  a Pi profiling pass later shows them hot; deferred deliberately here.
- Reviewer focus: pixel-identical clock/date rendering and now-line position,
  and that midnight rollover still advances `todayKey` in `CalendarPage`
  (Step 2's referential-equality bailout is the subtle part).
