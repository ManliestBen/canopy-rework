# Connecting Canopy's integrations (admin guide)

Every integration is optional — Canopy runs without any of them and
`/api/health` shows what's connected. All credentials live in `.env`
and key files outside the repo (see `.env.example`); nothing secret
ever reaches the browser.

## Google Calendar (service account)

One-time setup (~10 minutes):

1. In [Google Cloud Console](https://console.cloud.google.com), create
   (or reuse) a project → **APIs & Services → Enable APIs** → enable
   **Google Calendar API**.
2. **IAM & Admin → Service Accounts → Create service account** (name it
   e.g. `canopy-panel`). No roles needed.
3. Open the account → **Keys → Add key → JSON**. Save the file as
   `~/.config/canopy/service-account.json` on the Pi, `chmod 600` it.
4. In `.env`: `GOOGLE_SERVICE_ACCOUNT_PATH=/home/pi/.config/canopy/service-account.json`
5. Restart Canopy (`sudo systemctl restart canopy`).

Then, for each family calendar (this is the part the panel guides you
through — Calendar → Manage → Add calendar):

1. In Google Calendar (web), open the calendar's **Settings and
   sharing** → **Share with specific people** → add the service-account
   email (Canopy shows it with a copy button; "Make changes to events"
   lets Canopy add/edit events).
2. Copy the **Calendar ID** from "Integrate calendar".
3. Paste it into Canopy, tap **Check** — you should see
   "✓ Found: <calendar name>" — pick a color and person, done.

## Subscribed calendars (ICS)

No setup needed. Any public calendar link works — school lunch menus,
sports teams, holidays. Paste the `.ics` (or `webcal://`) URL into
Calendar → Manage → Add calendar → **Calendar link (ICS)**. These are
read-only and refresh automatically.

## Gmail (outbound email: digest, announcements, test)

Canopy sends mail (the morning digest, optional announcement emails, and
the Settings "Send test" button) **from a dedicated Google account** —
e.g. `mackinaw.canopy@gmail.com`. It authenticates with an OAuth
**refresh token** rather than a password, so no password is ever stored.

This is the fiddliest integration, so here is the full click-by-click
walkthrough for obtaining the three `GOOGLE_OAUTH_*` values. Do the whole
thing **while signed in as the Canopy Google account** (not your personal
account) — the refresh token is bound to whoever authorizes it, and that
account becomes the "from" address.

### Step A — Enable the Gmail API

1. Go to [Google Cloud Console](https://console.cloud.google.com) and
   select the **same project** you used for the Calendar service account
   (or create one: **Select a project → New project**).
2. **APIs & Services → Library**, search **Gmail API**, open it, click
   **Enable**.

### Step B — Configure the OAuth consent screen (one time per project)

1. **APIs & Services → OAuth consent screen**.
2. User type: **External**, then **Create**.
3. Fill the required fields: an **App name** (e.g. "Canopy Panel"), a
   **User support email**, and a **Developer contact email** at the
   bottom. You can leave everything optional blank. **Save and continue.**
4. **Scopes**: you don't have to add any here — the token request in
   Step D asks for the send scope directly. **Save and continue.**
5. **Test users → Add users**: add the **Canopy account's email address**
   (`mackinaw.canopy@gmail.com`). This is required while the app is in
   "Testing" mode, otherwise Google blocks the authorization. **Save and
   continue → Back to dashboard.** (You do not need to "Publish" the app;
   Testing mode is fine for a single account.)

### Step C — Create the OAuth client ID + secret

1. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
2. **Application type: Web application** (this matters — the OAuth
   Playground used in Step D is a web redirect).
3. Under **Authorized redirect URIs → Add URI**, add exactly:
   `https://developers.google.com/oauthplayground`
4. **Create.** A dialog shows your **Client ID** and **Client secret** —
   these are your `GOOGLE_OAUTH_CLIENT_ID` and
   `GOOGLE_OAUTH_CLIENT_SECRET`. Copy both now (you can always reopen the
   credential later to see them again).

### Step D — Exchange for a refresh token (OAuth Playground)

1. Open the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
   **while signed in as the Canopy account**.
2. Click the **⚙ gear** (top-right) → tick **Use your own OAuth
   credentials** → paste the **Client ID** and **Client secret** from
   Step C → **Close**.
3. In the left **"Input your own scopes"** box, enter exactly:
   `https://www.googleapis.com/auth/gmail.send`
   then click **Authorize APIs**.
4. Sign in / choose the **Canopy account** and grant access. If you see a
   "Google hasn't verified this app" warning, click **Advanced → Go to
   Canopy Panel (unsafe)** — this is expected for a Testing-mode app you
   own.
5. Back in the Playground, click **Exchange authorization code for
   tokens**. The response panel shows a **Refresh token** (starts with
   `1//`). That is your `GOOGLE_OAUTH_REFRESH_TOKEN`.
   - If the **Refresh token** field is empty, revoke access at
     [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
     for the Canopy account and repeat Step D — Google only returns a
     refresh token on the **first** authorization.

### Step E — Put the values in `.env` and restart

```
GOOGLE_OAUTH_CLIENT_ID=<Client ID from Step C>
GOOGLE_OAUTH_CLIENT_SECRET=<Client secret from Step C>
GOOGLE_OAUTH_REFRESH_TOKEN=<Refresh token from Step D>
CANOPY_EMAIL_FROM=mackinaw.canopy@gmail.com
```

Then restart Canopy (`sudo systemctl restart canopy`, or just re-run
`npm start` in dev) and confirm:

1. `curl -s localhost:3000/api/health` shows `gmail.configured: true`.
2. In the panel: **Settings → Daily email digest**, add a **recipient
   email**, then tap **Send test**. The test message is sent **to the
   configured digest recipient(s)** (not an arbitrary address), so a
   recipient must be set first — you'll get a clear "Add a digest
   recipient first" message otherwise.

### Notes & troubleshooting

- **Refresh tokens are long-lived** but can be revoked if you change the
  Canopy account's password or revoke access in its Google security
  settings. If email suddenly stops, redo Step D to mint a fresh token.
- A Testing-mode OAuth app's refresh tokens can expire after 7 days.
  For a set-and-forget panel, either keep the app in Testing and re-mint
  when needed, or **Publish** the consent screen (**OAuth consent screen →
  Publish app**) to make the token durable — publishing a
  single-`gmail.send`-scope app used only by your own account does not
  require Google verification for this use.
- Never commit these values. They live only in `.env` (git-ignored). If a
  refresh token is ever exposed, revoke it in the Canopy account's
  [permissions](https://myaccount.google.com/permissions) and mint a new
  one.

## Weather (OpenWeatherMap)

1. Get a free API key at [openweathermap.org](https://openweathermap.org/api).
2. `.env`: `OPENWEATHERMAP_API_KEY=…`
3. Set the location in Settings (or during onboarding). Alerts require
   the One Call 3.0 subscription (free tier available); without it,
   forecasts still work and alerts are simply absent.

## Photos (Cloudinary)

1. In your [Cloudinary console](https://console.cloudinary.com), copy
   the **API environment variable** (`cloudinary://key:secret@cloud`).
2. `.env`: `CLOUDINARY_URL=cloudinary://…`
3. Upload photos (the Cloudinary mobile app or web console both work;
   folders become selectable albums on the Photos page).

Until Cloudinary is connected, the slideshow uses built-in starter
images so sleep mode still works.

## Cloud backup (MongoDB)

Optional. When configured, Canopy saves a **full snapshot of its database**
(everything — calendars, chores, star balances, lists, meals, announcements,
settings, members) to MongoDB **once a day automatically**, and whenever you
tap **Back up now** in Settings. SQLite on the panel stays the source of
truth; the cloud copy is for disaster recovery, and Settings can **restore
the latest snapshot** if the Pi's storage ever dies.

1. Create a MongoDB database — e.g. a free [MongoDB Atlas](https://www.mongodb.com/atlas)
   cluster. Create a database user, allow your network, and copy the
   **connection string** (include a database name, e.g. `…/canopy`).
2. In `.env`:
   ```
   MONGODB_URI=mongodb+srv://user:pass@cluster.example.mongodb.net/canopy?retryWrites=true&w=majority
   ```
3. Restart Canopy. Confirm in **Settings → Backup** — the "Cloud backup"
   panel shows it's connected and lets you back up now or restore.

Notes:
- Snapshots rotate automatically (the most recent 14 are kept).
- The snapshot contains the family PIN hash (it's a full DB copy), so treat
  the MongoDB database as private — don't share the connection string.
- If MongoDB is unreachable, the panel keeps working normally; the daily
  backup simply retries the next day, and "Back up now" reports the error.

## Checking status

```bash
curl -s localhost:3000/api/health | python3 -m json.tool
```

shows `configured` / `ok` per integration, plus each calendar's fetch
status in the Calendar → Manage screen.
