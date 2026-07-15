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
- **Extras** — countdown timer, on-panel event reminders, PIN-guarded
  remote access from phones, settings lock, offline-tolerant caching,
  config backup/restore, 7 themes (Skylight default) with adjustable
  glass effect

## Docs

| Doc | For |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | The family — how to use everything |
| [docs/SETUP_INTEGRATIONS.md](docs/SETUP_INTEGRATIONS.md) | Connecting Google, weather, photos, email |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Raspberry Pi kiosk install |
| [PLAN.md](PLAN.md) | Architecture & build plan |

## Develop

```bash
npm ci
npm run dev        # server :3000 + Vite :5173 (proxies /api)
npm test           # unit/integration tests (all workspaces)
npm run typecheck
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
