# Deploying Canopy to the wall panel (Raspberry Pi)

Canopy runs as one Node process that serves both the API and the built
web app. The panel's browser runs in kiosk mode pointed at itself.

## One-time setup

```bash
# On the Pi (Node 20+ required)
git clone https://github.com/ManliestBen/canopy-rework.git canopy
cd canopy
npm ci
npm run build

# Config: secrets live OUTSIDE the repo
mkdir -p ~/.config/canopy && chmod 700 ~/.config/canopy
cp .env.example .env   # edit: set CANOPY_DB_PATH=/home/pi/.config/canopy/canopy.db
```

Keep Google keys in `~/.config/canopy/` with `chmod 600`, and reference
them from `.env`. Never place key files inside the repo.

## systemd service (server)

`/etc/systemd/system/canopy.service`:

```ini
[Unit]
Description=Canopy family hub
After=network-online.target
Wants=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/canopy
EnvironmentFile=/home/pi/canopy/.env
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now canopy
curl -s localhost:3000/api/health   # → {"ok":true,...}
```

## Kiosk browser (display)

Autostart Chromium fullscreen on the panel
(`~/.config/autostart/canopy-kiosk.desktop` or labwc/wayfire autostart):

```bash
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --check-for-update-interval=31536000 \
  --app=http://localhost:3000
```

Disable screen blanking in `raspi-config` (Canopy manages its own
sleep/slideshow schedule from Phase 6).

## Security model

- The server trusts only loopback (the panel itself) by default.
- Phones/laptops on the LAN must log in with the family PIN (Settings →
  PIN). Without a PIN configured, remote access is fully rejected.
- `.env`, the SQLite file, and Google keys are never committed to git.

## Updating

```bash
cd ~/canopy && git pull && npm ci && npm run build
sudo systemctl restart canopy
```
