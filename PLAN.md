# Canopy Rebuild — Comprehensive Plan

## Context

Canopy is a wall-mounted family hub for a 23.8" Full HD (1920×1080) touch panel, inspired by the Skylight Calendar: family calendar, tasks, shopping lists, weather, and photo slideshow, combined with Home Assistant smart-home control. The current repo (`../canopy`) grew organically under Cursor and is today mostly an HA dashboard with a mature Google Calendar module bolted on. Most of the household-management features in `feature-list.md` (users, tasks, shopping, weather, slideshow, settings/backup, onboarding) were never built.

This rebuild starts clean in `canopy-rebuild/`, keeps the proven ideas, and structures the app around the family-hub feature set from the start. A close technical review of the existing implementation (findings below) also drives a set of correctness, efficiency, and security fixes that are designed in from day one rather than patched later.

**What we port (proven, working concepts):**
- Google Calendar service-account integration — event fan-out across calendars with per-calendar error tolerance (`Promise.allSettled` pattern), CRUD, diagnose flow
- Calendar UI concepts — daily/weekly/biweekly/monthly views, click-to-add, event detail modal, per-calendar colors, calendar management
- SQLite persistence (`better-sqlite3` — synchronous access is right for this workload; keep it)
- The six HA control areas and their service-call patterns
- Gmail send via OAuth refresh token (`mackinaw.canopy@gmail.com` identity)
- Vitest + Testing Library + GitHub Actions CI

---

## Design language: Skylight theme (new flagship)

The three PNGs in `../canopy/feature-list/` (`2-week-view.png`, `weekly-schedules.png`, `task-lists.png`) are actual Skylight product screenshots. The rebuild treats them as the **acceptance reference** for a new default theme, built token-first so it coexists with the ported themes.

**Two layers, deliberately separated:**

1. **Skylight layout patterns → the app shell itself** (all themes get these):
   - **Left icon rail** navigation: Calendar, Chores, Rewards, Meals, Photos, Lists, Sleep, Settings — small icon + label, pale rail background. This maps 1:1 onto our nav sections (top rail in portrait orientation).
   - **Header bar**: family/device name (large display type) · clock · weather chip (icon + temp) · row of member avatar chips (colored circle + initial) · view switcher. Avatar chips double as per-user filters; in chore context each chip carries a per-user progress bar ("2/5") like the reference.
   - **Calendar interactions**: per-day "+ Add Event" affordance and event count; multi-day banner events rendered as spanning pills above the time grid; each event pill carries a small member/calendar color dot; blue circular FAB "+" bottom-right for quick add.
   - **Chore chart**: per-user pastel-tinted columns with rounded task pills and tap-to-complete check circles (exactly `task-lists.png`).

2. **Skylight visual theme → the default theme** (tokens only; other themes override the same tokens):
   - **Canvas**: warm white (`#FCFCFA`-ish) content area; pale blue-gray icon rail; hairline column separators; generous whitespace.
   - **Palette**: the Skylight pastel family — mint/teal, coral, salmon pink, peach, marigold, lavender, blush — as `--pastel-*` tokens with slate-dark text (`#334` range) on all pills; per-user colors drawn from the same family.
   - **Shape**: 10–14px radius pills and cards, soft shadows, no borders on event pills.
   - **Typography**: refined serif display face for the family name / day numerals (Skylight header look), rounded geometric sans (e.g. Nunito Sans/Poppins) for UI text. Self-hosted fonts (kiosk may be offline).
   - Emoji-friendly event/task titles (the reference leans on them heavily).
   - Existing themes (Light/Dark/Bold/Pride) are re-implemented as overrides of the same token set; **Skylight becomes the default**, and per the feature list each theme keeps a dark variant (Skylight-dark: same pastels, deep slate canvas).
   - Theme acceptance check: side-by-side screenshot comparison against the three reference PNGs at 1920×1080.

---

## Technical review of the current implementation → rebuild decisions

A close review of the existing code (server, Google integration, DB, React app, CSS, tests) surfaced the following. Each item is a **design commitment for the rebuild**, not a patch to the old repo.

### Security (most important first)

| # | Finding in current code | Rebuild decision |
|---|---|---|
| SEC-1 | **No auth on anything.** All `/calendar-api/*` routes and the HA proxy are open — any device on the LAN can unlock doors via `POST /api/services/lock/unlock`, read home GPS coords, or spam calendar invites. | All API routes behind auth middleware from Phase 0: the panel holds a device token; other clients (phones) log in with PIN → session. Server can optionally bind to localhost + reverse proxy. |
| SEC-2 | **HA proxy is an open relay** forwarding the entire HA REST API with a privileged long-lived token. | Proxy an explicit **allowlist**: `GET /api/states` + `POST /api/services/{domain}/{service}` only for domains the UI actually controls (light, climate, switch, fan, cover, lock, alarm_control_panel). |
| SEC-3 | HA token named `VITE_HA_TOKEN` — one accidental `import.meta.env` reference away from shipping the token in the JS bundle (verified not leaked today, but a footgun). | Secrets never carry the `VITE_` prefix; single server-only `HA_TOKEN`. Client receives zero secrets. |
| SEC-4 | Google keys (`SERVICE_ACCOUNT.json`, OAuth client secret, refresh token) sit in the app directory. | Secrets live outside the app root (`~/.config/canopy/` or env-specified paths), `chmod 600`; paths configured via env. |
| SEC-5 | Input validation is inconsistent (POST events unvalidated while PATCH validates; times string-concatenated; attendee emails passed through with `sendUpdates:'all'` → invite-spam vector). | **zod schemas shared between create/update** validate every request body (dates, `HH:MM`, emails, array caps). `sendUpdates` defaults to `'none'` unless explicitly confirmed in the UI. Same schemas validate API responses client-side, so types are inferred, not cast. |
| SEC-6 | `/diagnose` endpoint and raw `err.message` responses leak service-account email and internal errors to any caller. | Diagnostics gated behind auth/admin; client-facing errors are generic, details go to server logs. |
| SEC-7 | No security headers, CORS policy, or rate limiting. | `helmet`, explicit CORS (effectively none needed — same origin), `express-rate-limit` on write routes. |

### Backend architecture & efficiency

| # | Finding | Rebuild decision |
|---|---|---|
| BE-1 | ~300 lines of routes duplicated verbatim between `server.js` and `calendar-server.js`, already drifted (validation differs between the copies). | **One server, one router tree.** Dev mode = Vite proxying to the single real server. No second implementation to drift. |
| BE-2 | Every `/events` request re-fetches Google `calendarList` + per-calendar summaries — static data refetched on every poll, burning quota and latency. | Calendar metadata cached (in-memory TTL + persisted titles in DB). Event fetching decoupled from client polls: server refreshes on its own interval and serves the **cached last-good payload** instantly — also the foundation of offline mode. |
| BE-3 | Google auth client + key file re-read from disk **on every API call** (×N calendars per request). | One auth client constructed at startup and reused (token caching is then automatic). Evaluate lighter `google-auth-library` + REST vs full `googleapis`. |
| BE-4 | Schema "migration" is an ad-hoc `PRAGMA table_info` + `ALTER TABLE` on startup — no versioning or ordering. | Numbered migrations tracked via `PRAGMA user_version`; `journal_mode=WAL`, `foreign_keys=ON` at init. |
| BE-5 | Per-route copy-pasted try/catch; async errors easy to drop. | Central error middleware + async route wrapper. |
| BE-6 | No timeouts/retries anywhere: Google or HA down ⇒ requests hang on default socket timeouts; proxy has no error handler; `process.exit(1)` if HA env is missing (calendar dies because HA is unconfigured). | Timeouts + retry-with-backoff on all outbound calls; proxy timeout with clean 502; **graceful degradation** — each integration (HA, Google, weather, Cloudinary) is independent, reports status via `/api/health`, and the rest of the app runs without it. |
| BE-7 | `console.log` only; silent per-calendar event truncation (`250/N` cap). | Structured logging (`pino` + request logging); explicit paging or surfaced truncation in the events API. |

### Frontend data layer & correctness

| # | Finding | Rebuild decision |
|---|---|---|
| FE-1 | A single failed 30s poll **blanks the whole dashboard** (`setStates([])` in catch) — visible flicker on any network blip; no request cancellation, so overlapping fetches race and stale snapshots clobber newer state (sliders jump back). | **TanStack Query for all reads/mutations**: last-good data retained on error, silent retry/backoff, request dedupe + cancellation, optimistic mutations with rollback, structural sharing so unchanged data doesn't re-render every card. |
| FE-2 | CalendarTab never refreshes after mount — a wall calendar shows stale events indefinitely; "today" highlight is frozen at mount, so past midnight it highlights yesterday. | `refetchInterval` + scheduled midnight invalidation; a `useToday()` tick hook so date-dependent UI rolls over. |
| FE-3 | **DST bugs in hand-rolled date math**: day/week navigation adds ±86,400,000 ms (skips/repeats a day across DST transitions); default event date uses `toISOString()` (UTC) — evening users west of UTC get *tomorrow*; two contradictory date conventions in the same app. | A single pure `lib/dates.ts` built on **date-fns** (`addDays`, `startOfWeek`, `format`) — no millisecond arithmetic, all local-date formatting through one function. **Unit-tested with pinned-timezone DST fixtures.** |
| FE-4 | Multi-day *timed* events render only on their start day; events crossing midnight vanish from subsequent days. | Event expansion handles timed ranges (and renders continuation, per the Skylight multi-day banner pattern). |
| FE-5 | **Editing any recurring event silently corrupts it** — the RRULE is never parsed back into the form, so saving a yearly birthday rewrites it to "every weekday". Multi-reminder events lose reminders on edit. | Round-trip recurrence with the `rrule` library; if a rule can't be represented in the form, show it read-only instead of destroying it. Reminders preserved verbatim unless edited. |
| FE-6 | `CalendarTab.tsx` is 1,163 lines mixing date math, CRUD forms, 3 modals, 4 view renderers, ~18 `useState`s; Add/Edit event modals are ~300 lines each, 90% duplicated. | Decompose: pure date lib + query hooks + presentational components (`TimeGrid`, `DayColumn`, `EventCard`, …); **one shared `EventForm`** for add/edit. |
| FE-7 | Tests mostly assert their own mocks; zero tests on the pure date logic where the real bugs live. | Test pyramid inverted correctly: heavy unit tests on pure logic (dates, recurrence, expansion), component tests for interaction, Playwright smoke for flows. |

### CSS, theming & kiosk fitness

| # | Finding | Rebuild decision |
|---|---|---|
| UI-1 | 2,076-line `index.css`; each of 6 themes re-declares every variable; the "glass" selector list is copy-pasted per theme; pastel palette defined in 3 places (twice in CSS, once in JS). | **Primitives → semantic tokens → per-theme overrides.** Themes override only what differs. Pastels defined once as `--pastel-*` custom properties, consumed by both CSS and JS swatches. Transparency-level setting maps to `--panel-alpha`/`--panel-blur` tokens. |
| UI-2 | Event text colors hard-coded (`#1e293b`) regardless of theme or user-chosen hex → dark-on-dark possible. | Contrast-computed text color for user-chosen colors (relative-luminance check). |
| UI-3 | Pride theme runs infinite gradient animations on every ON toggle — continuous GPU work on a 24/7 Pi. | `prefers-reduced-motion` respected; no always-on animations in kiosk mode (animate on interaction only). |
| UI-4 | Touch targets far below 44px (20px help buttons, 22px swatches, 32–36px buttons); hover-only affordances stick/never fire on touch; `window.confirm()` for deletion; ad-hoc Escape/focus handling per modal. | **44px minimum hit targets** globally; `@media (hover:hover)` guards with `:active` equivalents; one accessible Dialog primitive (Radix) — focus trap, scroll lock, consistent styled confirms; `pointerdown` for dismissal. |

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Same as current; port-friendly |
| Routing | React Router | Real routes per rail section |
| Data | TanStack Query | FE-1/FE-2: caching, retries, cancellation, optimistic updates |
| Dates | date-fns + `rrule` | FE-3/FE-5: DST-safe math, recurrence round-trip |
| Styling | CSS Modules + design tokens | UI-1: token pipeline shared by all themes incl. Skylight |
| UI primitives | Radix (Dialog/Popover) | UI-4: accessible, touch-correct modals |
| Backend | Node 20 + Express + TypeScript, **single server** | BE-1; serves SPA + `/api` + allowlisted HA proxy |
| Validation | zod (shared request/response schemas in `shared/`) | SEC-5/FE typing: one schema, inferred types both sides |
| Database | better-sqlite3 + `user_version` migrations | BE-4; per feature list (one file, easy backup) |
| Security | helmet, express-rate-limit, device-token/PIN auth middleware | SEC-1/7 |
| Logging | pino + pino-http; `/api/health` | BE-7, kiosk debuggability |
| Google | Calendar service account + Gmail OAuth (ported), single startup client, cached metadata | BE-2/BE-3 |
| Photos / Weather | Cloudinary / OpenWeatherMap | Per feature list |
| Testing | Vitest (client + server), Playwright smoke E2E | FE-7; server tests are new |
| CI | GitHub Actions: lint, typecheck, test, build | Extends current CI |

**Monorepo layout:**

```
canopy-rebuild/
├── package.json           # npm workspaces: client, server, shared
├── client/src/{app,features,components,styles,lib}
├── server/src/{routes,services,db,integrations}
├── shared/                # zod schemas + inferred types (Task, User, Event…)
├── e2e/                   # Playwright smoke tests
└── .github/workflows/ci.yml
```

---

## Feature Plan (phased)

Every phase ends with a usable app. Checkboxes map to `feature-list.md`; **➕ NEW** marks proposed additions.

### Phase 0 — Scaffold & foundations
- Monorepo scaffold; SQLite + migration runner (BE-4); single Express TS server with auth middleware, helmet, rate limiting, health endpoint, pino (SEC-1/7, BE-5/7)
- App shell: persistent clock/date header, **Skylight icon-rail nav** (side in landscape, top in portrait), 1920×1080-first layout
- **Token pipeline + Skylight theme** (default) with dark variant; port Light/Dark/Bold/Pride as token overrides; transparency-level token (UI-1/2/3)
- `lib/dates.ts` on date-fns with DST-fixture tests from day one (FE-3)
- CI workflow; Playwright harness
- ➕ NEW: Kiosk deployment story — systemd unit + Chromium kiosk doc for the Pi

### Phase 1 — Users, Settings, Onboarding
- Users: add/edit/delete, per-user color (from the Skylight pastel family), avatar chip (initials/emoji)
- Settings: theme, transparency, brightness, volume, device name
- Backup/restore: config JSON export/import + SQLite file copy
- Onboarding wizard: first user → location → defer calendar/sleep-wake
- ➕ NEW: **Settings/HA PIN lock** (also the auth backing for non-panel clients — SEC-1)

### Phase 2 — Calendar (port + fix + Skylight-ify)
- Backend: saved-calendar CRUD, cached event fan-out with server-side refresh + last-good cache (BE-2), zod-validated event CRUD (SEC-5), gated diagnose (SEC-6)
- UI: daily/weekly/biweekly/monthly views rebuilt on the decomposed component set (FE-6) with Skylight patterns — per-day "+ Add Event", event counts, member dots on pills, multi-day banner events (FE-4), FAB quick-add
- One shared EventForm; **recurrence round-trip via `rrule`** (FE-5); auto-refresh + midnight rollover (FE-2)
- Agenda / "what's next" view (promoted from stretch) as the main-screen glance panel
- ➕ NEW: ICS subscription support (school/sports calendars by URL)
- ➕ NEW: Per-user event filtering via header avatar chips (Skylight pattern)

### Phase 3 — Tasks & Chores
- Tasks: CRUD, per-user, deadlines, categories, recurring (shared `rrule` logic); overdue highlighting; dated tasks in Agenda
- ➕ NEW: **Chore chart & rewards** — per-user pastel columns with tap-to-complete pills and per-user progress bars in the header (exactly the `task-lists.png` reference); star/points tally feeding a simple Rewards screen
- ➕ NEW: Visual countdown timer ("10 minutes until we leave")

### Phase 4 — Shopping / Grocery Lists
- Multiple named shared lists; quick-add, optional assignee, done state, clear-completed
- ➕ NEW: Frequent-items quick add
- ➕ NEW: Lightweight meal planner (week strip of dinner slots → push ingredients to a list; fills the rail's "Meals" slot)

### Phase 5 — Weather
- OpenWeatherMap; header weather chip (Skylight pattern) + full forecast page; alerts banner; optional forecast chips on calendar day headers; configurable location

### Phase 6 — Sleep, Wake & Photo Slideshow
- Sleep/wake schedule → dim or slideshow; idle timeout → slideshow; touch to wake
- Cloudinary slideshow: folder/tag selection, preload + crossfade, local starter set; photo sources pluggable (local/NAS on roadmap per feature list)
- ➕ NEW: Screensaver overlay widgets (clock, next event, weather over photos)

### Phase 7 — Home Assistant
- **Allowlisted** server-side HA proxy (SEC-2), token server-only (SEC-3), graceful degradation when HA absent (BE-6)
- Port six control areas as one "Home" section, restyled to tokens; optimistic controls via mutations (FE-1)
- ➕ NEW: HA WebSocket for live entity state (falls back to polling)
- Stretch: HA notifications, cameras, scenes/routines (ties sleep/wake + HA), energy widget

### Phase 8 — Messaging & Gmail
- Port Gmail send as a configured server module (not a script); family announcements / sticky notes on main screen
- Outbound: event/task reminders, optional daily agenda digest
- Stretch: inbound email-to-add; guest-access links; **consolidate Calendar onto the Canopy Gmail identity** (per feature list)

### Phase 9 — Hardening & stretch
- Offline/degraded mode (builds on BE-2's last-good cache + Query persistence), offline indicator
- Event reminders with on-panel visible/audible alerts; guest/view-only mode; vacation/away mode; multi-device naming; responsive/mobile pass
- Root-Access-Granted integration as its own rail section (deferred, per feature list)

---

## Proposed additions — summary (for your yes/no)

| # | Addition | Phase | Why |
|---|---|---|---|
| 1 | Kiosk deployment (systemd + Chromium kiosk doc) | 0 | It runs on a Pi; deployment shouldn't be ad-hoc |
| 2 | Settings/HA PIN lock (+ device auth) | 1 | Kids + touchscreen + door locks; closes SEC-1 |
| 3 | ICS calendar subscriptions | 2 | Schools/teams publish ICS, not Google IDs |
| 4 | Per-user event filtering via avatar chips | 2 | Core Skylight interaction (visible in reference PNGs) |
| 5 | Chore chart + stars/rewards | 3 | Skylight's marquee feature; reference PNG exists |
| 6 | Visual countdown timer | 3 | Small build, huge family utility |
| 7 | Frequent-items quick add | 4 | Grocery lists live or die on entry speed |
| 8 | Lightweight meal planner → shopping list | 4 | Fills the Skylight rail's "Meals" slot; kept simple |
| 9 | Screensaver overlay widgets | 6 | Panel stays useful while "asleep" |
| 10 | HA WebSocket live updates | 7 | Instant device state vs 30s polling |
| 11 | Health endpoint + structured logs | 0 | Wall-mounted devices fail silently otherwise |
| 12 | Playwright E2E smoke tests | 0+ | CI confidence for a device you don't watch |

---

## Data model (initial)

`users` (id, name, color, avatar, is_admin) · `settings` (key, value — theme, transparency, location, sleep/wake, device name, PIN hash) · `saved_calendars` (ported + `source_type` google|ics) · `tasks` (id, title, user_id, category, due_at, rrule, completed_at) · `chores` (id, title, user_id, schedule, points) + `chore_completions` · `lists` + `list_items` (list_id, text, assignee_id, done) · `meals` (date, slot, name, notes) · `announcements` (text, author_id, expires_at) · `auth_tokens` (device/session credentials)

## Verification

- Every phase: Vitest unit tests (incl. **server routes/services — new**, and DST-fixture date tests), typecheck, CI green
- Playwright smoke flows grown per phase (onboarding → add user → add task → check off; calendar add-event; list add/check)
- **Skylight theme acceptance**: screenshot comparison against the three reference PNGs at 1920×1080
- Security spot-checks: unauthenticated requests rejected; HA proxy refuses non-allowlisted paths; no secrets in built client bundle (`grep` the dist)
- Manual device pass at 1920×1080 both orientations per phase; integrations tested once each against real services (Calendar, Gmail, OWM, Cloudinary, HA)

## Explicitly deferred / dropped

- Google Photos (dropped per feature list — Cloudinary instead)
- Root-Access-Granted (deferred, own phase later)
- HA cameras/notifications/scenes/energy (stretch, after Phase 7 core)
