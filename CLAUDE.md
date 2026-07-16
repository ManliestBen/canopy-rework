# CLAUDE.md — working in the Canopy repo

Canopy is a wall-mounted family-hub touchscreen (calendar, chores, rewards,
to-dos, meals, shopping lists, photos, weather, announcements) that runs 24/7
on a Raspberry Pi kiosk. Read `PLAN.md` for the architecture rationale and the
decided tradeoffs.

## Workspaces (npm workspaces)

- `shared/` — zod schemas + pure date/schedule/sleep logic, shared by both
  sides (`@canopy/shared`). Types are inferred from zod, never hand-written.
- `server/` — Express + TypeScript, run via **tsx** (no build step in dev/prod).
  better-sqlite3 (synchronous — deliberate), versioned migrations, pino.
- `client/` — React 18 + Vite + TanStack Query + react-router + date-fns +
  rrule. CSS-module-ish token theming.

## Commands (run from the repo root)

| Task | Command | Notes |
|---|---|---|
| Install | `npm ci` | |
| Dev | `npm run dev` | server :3000 + Vite :5173 (proxies /api) |
| Typecheck | `npm run typecheck` | `tsc --noEmit` in each workspace |
| Test | `npm test` | Vitest, all workspaces |
| Build | `npm run build` | shared + server typecheck, client bundle |
| E2E | `npm run e2e` | Playwright smoke (needs `npm run build` first) |
| Lint | `npm run lint` | ESLint (flat config) |
| DB bootstrap | `npm run bootstrap --workspace server` | create+migrate the DB |

**`build` for `shared`/`server` is `tsc --noEmit`** — it only typechecks; the
server runs from TypeScript via tsx, there is no emitted `dist/` for it.

If server tests fail on import with `NODE_MODULE_VERSION … better_sqlite3.node`,
your Node differs from the one that built the native module — run
`npm rebuild better-sqlite3` (Node 20 or 22).

## Invariants — do not break these

- **Tests pin the timezone**: every workspace's `test` script sets
  `TZ=America/Chicago`. Date/DST logic depends on it — never write a
  time-sensitive test that assumes the runner's zone (CI once broke on this).
- **Trust model**: loopback (the panel) is trusted; every other device needs
  the family PIN → an httpOnly session cookie. `app.set('trust proxy', false)`
  makes `req.socket.remoteAddress` unspoofable — keep it. Every `/api/*`
  router except health/auth mounts **after** `requireAuth`.
- **Secrets never reach the client**: no `VITE_`-prefixed secrets, nothing
  secret imported into `client/src`. The PIN hash lives in its own settings
  key (`__pin__`) and is **excluded from the Settings schema and the JSON
  backup**. Secrets are read only in `server/src/config.ts` from env.
- **In findings/commits, never paste a secret value** — reference file:line +
  type, and recommend rotation.
- **Server tests are real integration tests** over supertest with an in-memory
  DB (`openTestDb()` / `closeDb()`), not mock-heavy unit tests. Follow the
  `phase*.test.ts` style. supertest always connects over loopback; to exercise
  the remote/PIN path use the `x-canopy-test-remote` header (honored only under
  `process.env.VITEST`, see `auth/middleware.ts`).
- **The database self-installs**: `bootstrapDatabase()` creates the dir + file
  (owner-only perms — it holds the PIN hash) and migrates on first run.
  Migrations in `server/src/db/migrate.ts` are append-only + transactional.
- **Integrations degrade independently** and are all optional (Google, weather,
  Cloudinary, Gmail, MongoDB cloud backup). Each caches last-good data and
  reports status at `/api/health`; the app runs without any of them.
- **Calendar correctness is subtle**: dates go through `shared/src/dates.ts`
  (date-fns, no millisecond arithmetic); recurrence round-trips via `rrule`.
  ICS occurrence instants are reconstructed from node-ical's local-wall-clock
  fields (see `services/icsFeed.ts`) — re-run its probe if node-ical is bumped.

## Advisor plans

`plans/` holds implementation plans and an index (`plans/README.md`) generated
by the `/improve` advisor, including a backlog of vetted-but-unplanned findings
and stretch goals. Check it before starting audit-style work.
