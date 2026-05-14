# GreenGeeks Reseller VPS: Complete WebSocket Server Setup Guide

This guide shows how to deploy `websocket/server.php` for IlluminatOS! multiplayer on a GreenGeeks reseller VPS.

It is written for the most common GreenGeeks stack:
- cPanel/WHM-managed VPS
- Apache as public web server
- HTTPS enabled for your domain
- SSH access available

---

## 0) What you are deploying

You have two moving parts:

1. **Main web app / API** (regular PHP app served by Apache)
2. **WebSocket sidecar** (`php websocket/server.php`) running as a long-lived background process

Traffic flow in production:

- Browser connects to `wss://yourdomain.com/ws`
- Apache reverse-proxies `/ws` to `ws://127.0.0.1:8081/ws`
- Sidecar authenticates against your API (`/api/v2/auth/me`)

---

## 1) Prerequisites checklist

Before starting, confirm:

- [ ] You can SSH into the VPS as a user with permission to edit vhost/service config
- [ ] Your domain resolves to the VPS IP
- [ ] SSL is active for your domain (AutoSSL or custom cert)
- [ ] Project code is deployed on server
- [ ] PHP CLI is available (`php -v`)
- [ ] Required PHP extensions for your app are installed

Quick checks:

```bash
php -v
php -m | head
cd /path/to/newRetroOS
php -l websocket/server.php
```

---

## 2) Deploy/update project code

If you deploy with git:

```bash
cd /path/to/newRetroOS
git fetch --all
git checkout <your-branch-or-main>
git pull
```

If you deploy by upload/sync, ensure these files exist server-side:

- `websocket/server.php`
- `websocket/WebSocketFrame.php`
- `websocket/auth.php`
- `websocket/rooms.php`
- `websocket/handlers.php`

---

## 3) Configure runtime environment values

The WebSocket server reads:

- `PHP_WS_PORT` (default `8081`)
- `PHP_API` (default `http://localhost:8000`)

For GreenGeeks/cPanel, you usually want:

- Sidecar listening on **localhost only** port `8081`
- `PHP_API` pointing to your local app/API URL

Example values:

- `PHP_WS_PORT=8081`
- `PHP_API=http://127.0.0.1` (or your app base URL path if required)

> If your API is under a subpath (e.g. `/app`), set `PHP_API` to that base path, like `https://yourdomain.com/app`.

---

## 4) Start the sidecar manually (first smoke test)

From repo root:

```bash
cd /path/to/newRetroOS
PHP_WS_PORT=8081 PHP_API=http://127.0.0.1 php websocket/server.php
```

Expected startup logs include:
- WebSocket server running on port 8081
- Health check URL
- WebSocket endpoint

In another terminal, test health endpoint:

```bash
curl -sS http://127.0.0.1:8081/health
```

You should get JSON like:

```json
{"status":"ok","connections":0,"rooms":1,"uptime":...}
```

Press `Ctrl+C` after confirming it works.

---

## 5) Run as a persistent background service (systemd preferred)

If your VPS gives root/systemd access, create:

`/etc/systemd/system/newretroos-ws.service`

```ini
[Unit]
Description=IlluminatOS WebSocket Sidecar
After=network.target

[Service]
Type=simple
User=<cpanel_or_app_user>
Group=<cpanel_or_app_user>
WorkingDirectory=/path/to/newRetroOS
Environment=PHP_WS_PORT=8081
Environment=PHP_API=http://127.0.0.1
ExecStart=/usr/bin/php /path/to/newRetroOS/websocket/server.php
Restart=always
RestartSec=3
StandardOutput=append:/var/log/newretroos-ws.log
StandardError=append:/var/log/newretroos-ws-error.log

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now newretroos-ws
sudo systemctl status newretroos-ws --no-pager
```

Useful log tail:

```bash
tail -f /var/log/newretroos-ws.log /var/log/newretroos-ws-error.log
```

---

## 6) If systemd is unavailable: Supervisor fallback

Install supervisor (if not present), then create program config:

`/etc/supervisor/conf.d/newretroos-ws.conf`

```ini
[program:newretroos-ws]
command=/usr/bin/env PHP_WS_PORT=8081 PHP_API=http://127.0.0.1 /usr/bin/php /path/to/newRetroOS/websocket/server.php
directory=/path/to/newRetroOS
autostart=true
autorestart=true
startsecs=2
user=<cpanel_or_app_user>
stdout_logfile=/var/log/newretroos-ws.log
stderr_logfile=/var/log/newretroos-ws-error.log
```

Then:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status newretroos-ws
```

---

## 7) Configure Apache reverse proxy for WebSockets

You need Apache modules:
- `proxy`
- `proxy_http`
- `proxy_wstunnel`
- `rewrite` (commonly already enabled)

In the SSL vhost for your domain, add:

```apache
ProxyPreserveHost On

# WebSocket endpoint
ProxyPass        /ws  ws://127.0.0.1:8081/ws retry=0 timeout=30
ProxyPassReverse /ws  ws://127.0.0.1:8081/ws

# Optional health passthrough
ProxyPass        /ws-health  http://127.0.0.1:8081/health
ProxyPassReverse /ws-health  http://127.0.0.1:8081/health
```

Reload Apache:

```bash
sudo apachectl configtest
sudo systemctl reload httpd
```

If your server uses `apache2` service name:

```bash
sudo systemctl reload apache2
```

### cPanel/WHM note
If direct vhost edits get overwritten, use:
- WHM include mechanism (`userdata` includes)
- or the official vhost include workflow for persistent custom directives

---

## 8) Firewall and exposure rules

Security target:
- Public internet hits only `443` (and maybe `80` for redirect)
- WebSocket sidecar port `8081` **not publicly exposed**

If using firewalld/ufw/csf, ensure external inbound to `8081` is blocked.

Quick local-only verification:

```bash
ss -lntp | rg 8081
```

You should see sidecar listening, typically on local interfaces only and accessed by Apache locally.

---

## 9) Frontend multiplayer config

You now have two good options:

### Option A (recommended): explicit URL
Set:

```json
{
  "multiplayer": {
    "websocketUrl": "wss://yourdomain.com/ws"
  }
}
```

### Option B: same-origin defaults
Use defaults with optional path override:

```json
{
  "multiplayer": {
    "websocketPath": "/ws",
    "useSameOrigin": true
  }
}
```

This works well behind Apache reverse proxy on GreenGeeks.

---

## 10) End-to-end validation steps

### A. Service health

```bash
curl -sS http://127.0.0.1:8081/health
curl -sS https://yourdomain.com/ws-health
```

### B. Browser WebSocket handshake
Open browser devtools on your app and verify:
- WebSocket connection to `wss://yourdomain.com/ws` (note: **no `?token=` query string** — the token travels as a subprotocol)
- Request header includes `Sec-WebSocket-Protocol: token.<hex>, illuminatos`
- Response header echoes `Sec-WebSocket-Protocol: illuminatos`
- Status 101 Switching Protocols

> Tokens in URLs leak into proxy access logs and browser history. Current IlluminatOS clients pass the session token via `Sec-WebSocket-Protocol` instead. The server (`websocket/server.php`) still accepts `?token=<hex>` and `Authorization: Bearer <hex>` for backwards compatibility, but prefer subprotocol auth in any new client and tighten your access-log retention accordingly.

### C. Multiplayer behavior tests
Open two authenticated sessions (different users):
1. Both appear online (`presence:online_list`/`presence:join`)
2. Send room chat message from A; B receives instantly
3. Start/join a game session and exchange `game` events
4. Kill sidecar (`systemctl stop ...`) and confirm client reconnect/degrade behavior
5. Restart sidecar and verify reconnect works
6. Log off in browser A (Start → Shut Down → Log Off). Confirm sidecar logs show A's connection closed and presence dropped before B sees B alone. The unified `SessionManager` cascade should disconnect WS, close SSE, and destroy presence before resolving the new login.

---

## 11) Troubleshooting playbook

### Problem: `WebSocket closed` immediately
- Check token auth path: `PHP_API` must resolve to your live API
- Check sidecar logs for auth failures
- Verify `/api/v2/auth/me` works for issued token

### Problem: HTTP 400 on `/ws`
- Client or proxy is sending a bad upgrade request
- Verify reverse proxy directives and that `/ws` is routed to sidecar

### Problem: connection timeout / 502 / 503
- Sidecar not running
- Wrong sidecar port in Apache config
- Firewall/local SELinux policy blocking local proxy

### Problem: works on `ws://` but not `wss://`
- SSL vhost mismatch
- Mixed content / wrong origin URL
- Ensure frontend uses `wss://yourdomain.com/ws`

### Problem: config overwritten after cPanel updates
- Move directives into persistent include mechanism in WHM

---

## 12) Recommended production hardening

- Keep sidecar behind reverse proxy only (no direct public port)
- Run sidecar as non-root user
- Enable log rotation for sidecar logs
- Keep heartbeat and rate-limit defaults unless load testing proves changes needed
- Monitor process restarts and memory usage
- Remove development-only endpoints/tools from production deployment
- **Audit your reverse-proxy access logs.** With the current client, the session token rides in `Sec-WebSocket-Protocol`, not the URL, so access logs that record only request lines no longer capture tokens. If your log format includes `%{Sec-WebSocket-Protocol}i`, strip or rotate it aggressively.

---

## 13) Quick command reference

```bash
# Start manually
PHP_WS_PORT=8081 PHP_API=http://127.0.0.1 php websocket/server.php

# Health
curl -sS http://127.0.0.1:8081/health

# systemd
sudo systemctl enable --now newretroos-ws
sudo systemctl status newretroos-ws --no-pager

# logs
tail -f /var/log/newretroos-ws.log /var/log/newretroos-ws-error.log

# Apache reload
sudo apachectl configtest && sudo systemctl reload httpd
```

---

## 14) Final verification checklist

- [ ] Sidecar starts automatically on reboot
- [ ] `/health` returns `status: ok`
- [ ] `wss://yourdomain.com/ws` upgrades with HTTP 101
- [ ] Multiplayer presence updates in real time
- [ ] Room chat/game events sync between at least two users
- [ ] No public exposure of port `8081`
- [ ] Logs show clean operation over at least 24h
