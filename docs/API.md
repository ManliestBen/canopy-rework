# Canopy HTTP API (for a companion app)

Canopy's panel and any other device on the home network talk to the same
Express server over a plain JSON HTTP API under `/api`. A future phone or
tablet **companion app** connects here too — there is no separate cloud
service and no second copy of the data. This doc is the map for building
one.

The request/response **shapes are defined once** as zod schemas in the
`shared/` workspace (`shared/src/schemas/*.ts`) and are the authoritative
contract — a companion app can share those types directly, or mirror them.
This file describes the surface and the auth model; the schemas describe the
exact fields.

## Base URL

The server listens on `PORT` (default `3000`) and serves both the web client
and the API from that one origin. On the LAN that's typically:

```
http://<panel-hostname-or-ip>:3000        e.g. http://canopy.local:3000
```

A companion app reaches the panel over Wi-Fi at the same address. (Exposing
the panel beyond the LAN is out of scope here and should be done behind a
proper reverse proxy / VPN — the built-in trust model assumes a home
network.)

## Authentication & the trust model

Two kinds of caller:

- **The panel itself** runs its browser on the same machine as the server,
  so **loopback** requests (`127.0.0.1` / `::1`) are trusted automatically —
  no login.
- **Every other device** (your companion app included) must present a
  **session cookie** obtained by logging in with the **family PIN**. Until a
  PIN has been set on the panel (Settings → Security), remote access is
  refused entirely.

Login flow:

1. `GET /api/health` — always open; use it to check the server is up.
2. `GET /api/auth/status` — open; returns
   `{ isPanel, authenticated, hasPin }`. If `hasPin` is `false`, tell the
   user to set the PIN on the panel first.
3. `POST /api/auth/login` with body `{ "pin": "1234" }`. On success the
   response sets an **httpOnly session cookie** (`canopy_session`, valid ~90
   days). Send that cookie on every subsequent request. Wrong PINs are rate
   limited (8 attempts / 15 min per device).
4. `POST /api/auth/logout` clears the session server-side.

All state-changing requests are additionally rate limited, every request
body is validated against a strict zod schema (unknown fields are rejected),
and error responses use a uniform envelope:

```json
{ "error": "human-readable message", "code": "machine_code" }
```

`401 { code: "unauthorized" }` means "log in first".

## Endpoint map

Resources follow conventional REST. Read the matching schema in
`shared/src/schemas/` for exact fields; read the route file in
`server/src/routes/` for exact paths.

| Area | Endpoints | Notes |
|---|---|---|
| Health | `GET /api/health` | Open. Per-integration `configured`/`ok`. |
| Auth | `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/pin` | See above. `login`/`pin` are rate limited. |
| Settings | `GET /api/settings`, `PATCH /api/settings` | Never includes the PIN hash. |
| Family members | `GET/POST /api/users`, `PATCH/DELETE /api/users/:id` | Colors/avatars drive the whole UI. |
| Calendars | `GET/POST /api/calendars`, `PATCH/DELETE /api/calendars/:id`, `POST /api/calendars/verify` | Google + subscribed (ICS) sources. |
| Events | `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST/PATCH/DELETE /api/events` | Served from a cached, always-fast, offline-tolerant store. ICS events are read-only. |
| To-Dos | `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/toggle` | Recurring tasks supported. |
| Chores | `GET/POST /api/chores`, `PATCH/DELETE /api/chores/:id`, `GET /api/chores/day?date=YYYY-MM-DD`, `POST /api/chores/:id/toggle` | Per-day chart + star values. |
| Rewards | `GET /api/rewards`, `POST /api/rewards/redeem` | Star balances + redemption history. |
| Lists | `GET/POST /api/lists`, `PATCH/DELETE /api/lists/:id`, item + `clear-completed` actions | Shopping/other lists. |
| Meals | `GET /api/meals?week=YYYY-MM-DD`, `PUT /api/meals` | Weekly planner. |
| Weather | `GET /api/weather` | Current + forecast + alerts (last-good cached). |
| Photos | `GET /api/photos` | Slideshow image list. |
| Announcements | `GET/POST /api/announcements`, `DELETE /api/announcements/:id` | Sticky notes. |
| Email | `GET /api/email/status`, `POST /api/email/test` | Test sends to configured digest recipients only. |
| Backup | `GET /api/backup`, `POST /api/backup/restore` | Settings + members, as a JSON file. |

## Minimal example (log in, then read this week's events)

```js
const base = 'http://canopy.local:3000';

// 1. Log in with the family PIN; keep the Set-Cookie value.
const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin: '1234' }),
});
const cookie = login.headers.get('set-cookie'); // store securely on device

// 2. Use the session cookie for subsequent requests.
const events = await fetch(`${base}/api/events?from=2026-07-13&to=2026-07-19`, {
  headers: { cookie },
}).then((r) => r.json());
```

(In a browser-based companion app the cookie is handled automatically with
`credentials: 'include'`; in a native app, persist and resend it yourself.)

## Notes for companion-app authors

- **Reuse the schemas.** Importing `@canopy/shared` (or generating types from
  it) keeps the app and server in lockstep; the server rejects anything that
  doesn't match, so guessing shapes will fail fast.
- **The panel stays the source of truth.** Data lives in the panel's SQLite
  database; the API is the only way in or out. There is no cloud mirror by
  design (offline-first), so a companion app should tolerate the panel being
  briefly unreachable and retry.
- **Respect read-only calendars.** Events from subscribed ICS feeds cannot be
  edited; the event payload marks them.
