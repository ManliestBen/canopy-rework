# Canopy

A wall-mounted family hub — calendar, chores, meals, lists, photos —
inspired by the Skylight Calendar, built for a 23.8" 1920×1080 touch
panel on a Raspberry Pi.

## Layout

| Workspace | What |
|---|---|
| `client/` | React + Vite + TypeScript UI (TanStack Query, token-based theming) |
| `server/` | Express + TypeScript API, SQLite (better-sqlite3), pino logging |
| `shared/` | zod schemas + the date library shared by both (single source of truth) |

## Develop

```bash
npm ci
npm run dev        # server on :3000, Vite on :5173 (proxies /api)
npm test           # all workspaces
npm run typecheck
npm run build
```

## Docs

- [PLAN.md](PLAN.md) — full build plan and architecture decisions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Raspberry Pi kiosk setup
- `docs/USER_GUIDE.md` — family user guide (Phase 9)

Secrets policy: no secrets in git, no secrets in the client bundle, no
`VITE_`-prefixed credentials — see `.env.example`.
