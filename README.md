# Canopy 🌳

A wall-mounted family hub — calendar, chores & rewards, to-dos, meals,
shopping lists, photos, weather — inspired by the Skylight Calendar,
built for a 23.8" 1920×1080 touch panel on a Raspberry Pi.

Ground-up rebuild of [canopy](https://github.com/ManliestBen/canopy)
with security, correctness, and the family feature set designed in from
the start. See [PLAN.md](PLAN.md) for the full architecture rationale.

## Features

- **Calendar** — Google Calendars (two-way) + subscribed ICS feeds
  (read-only), Agenda/Day/Week/2-Week/Month views, multi-day banners,
  per-member colors & filtering, safe recurrence editing, click-to-add
- **Chores** — Skylight-style per-kid chart, tap-to-check, star values
- **Rewards** — star balances, spend-stars flow with history
- **To-Dos** — assignees, categories, due dates, recurring tasks
- **Meals** — week planner; push ingredients to a shopping list
- **Lists** — multiple lists, frequent-item quick add, assignees
- **Photos** — Cloudinary slideshow with overlay widgets; sleep/wake
  schedule (dim or photos); idle screensaver
- **Weather** — OpenWeatherMap current + forecast + alerts, on the
  calendar day headers too
- **Announcements** — sticky notes on the main screen; optional email
- **Email** — morning agenda digest via the Canopy Gmail identity
- **Backup** — config export/import (JSON), plus optional **MongoDB cloud
  backup**: a full database snapshot saved daily and on demand, restorable
  from Settings
- **Extras** — countdown timer, on-panel event reminders, PIN-guarded
  remote access from phones, settings lock, offline-tolerant caching,
  7 themes (Skylight default) with adjustable glass effect

## Docs

| Doc | For |
|---|---|
| **In-app guide** — tap ❓ in the panel's header (route `/help`) | The family — beautiful, theme-aware, works on phones |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Same content as markdown (renders on GitHub) |
| [docs/SETUP_INTEGRATIONS.md](docs/SETUP_INTEGRATIONS.md) | Connecting Google, weather, photos, email (incl. full Google OAuth walkthrough) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Raspberry Pi kiosk install (database self-creates on first run) |
| [docs/API.md](docs/API.md) | The local HTTP API — for building a phone/companion app |
| [PLAN.md](PLAN.md) | Architecture & build plan |

## Run it on your PC (try it out without a Pi)

Canopy runs on any Mac/Windows/Linux machine, not just the Pi. Every
integration is optional and the database creates itself on first run, so
there is **no config to fill in** just to try it:

```bash
npm ci                 # once
```

**Option A — production-like (one server, closest to the Pi):**

```bash
npm run build          # bundle the client
npm start              # serves the app at http://localhost:3000
```

Open **http://localhost:3000**.

**Option B — development (hot reload while you tinker):**

```bash
npm run dev            # server :3000 + Vite :5173 (proxies /api)
```

Open **http://localhost:5173**.

Notes for local use:

- Because you're on the same machine as the server, the browser is treated as
  **the panel (loopback is trusted)** — no PIN needed. To exercise the
  phone/PIN flow, set a PIN in **Settings → Security**, then open the app from
  another device on your network at `http://<this-pc-ip>:3000`.
- Data lives in `./data/canopy.db` (git-ignored) in dev. Delete that file to
  start fresh. Set `CANOPY_DB_PATH` to put it elsewhere.
- To connect any optional integrations (Google, weather, photos, email,
  MongoDB cloud backup), copy `.env.example` to `.env` and fill in what you
  want — see [docs/SETUP_INTEGRATIONS.md](docs/SETUP_INTEGRATIONS.md).
- Designed for a 1920×1080 panel; in a desktop browser, maximize the window
  (or use the browser's device-toolbar at 1920×1080) for the intended layout.

## Develop

```bash
npm ci
npm run dev        # server :3000 + Vite :5173 (proxies /api)
npm test           # unit/integration tests (all workspaces)
npm run typecheck
npm run lint       # ESLint (flat config)
npm run build      # typecheck + client production bundle
npm run e2e        # Playwright smoke journey (needs npm run build first)
```

| Workspace | What |
|---|---|
| `client/` | React 18 + Vite + TS · TanStack Query · token-based theming |
| `server/` | Express + TS (via tsx) · better-sqlite3 + versioned migrations · pino |
| `shared/` | zod schemas + date/schedule/sleep logic shared by both |

## Security model

- No secrets in git, in the client bundle, or behind `VITE_` prefixes.
- The panel (loopback) is trusted; other devices need the family PIN
  (scrypt-hashed, rate-limited, httpOnly session cookies).
- Every request body is zod-validated; strict schemas reject unknown
  fields; helmet + rate limits on writes.
- Integrations degrade independently — Google down ≠ blank calendar
  (last-good caches persist across restarts).
