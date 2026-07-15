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

Uses the dedicated Canopy Google account (e.g. `mackinaw.canopy@gmail.com`):

1. In the same Cloud project, enable the **Gmail API**.
2. **APIs & Services → Credentials → Create credentials → OAuth client
   ID** (Desktop app). Note the client ID + secret.
3. Obtain a refresh token for the Canopy account with the
   `https://www.googleapis.com/auth/gmail.send` scope (e.g. via
   [OAuth Playground](https://developers.google.com/oauthplayground):
   gear icon → "Use your own OAuth credentials" → authorize Gmail send
   as the Canopy account → exchange for tokens).
4. In `.env`:
   ```
   GOOGLE_OAUTH_CLIENT_ID=…
   GOOGLE_OAUTH_CLIENT_SECRET=…
   GOOGLE_OAUTH_REFRESH_TOKEN=…
   CANOPY_EMAIL_FROM=mackinaw.canopy@gmail.com
   ```
5. Restart, then Settings → Daily email digest → **Send test**.

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

## Checking status

```bash
curl -s localhost:3000/api/health | python3 -m json.tool
```

shows `configured` / `ok` per integration, plus each calendar's fetch
status in the Calendar → Manage screen.
