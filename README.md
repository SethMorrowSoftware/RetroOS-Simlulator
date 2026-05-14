# IlluminatOS!

A retro desktop operating system simulator built with vanilla JavaScript, HTML, and CSS.

## What this project is today

IlluminatOS! is a browser-hosted OS simulation with:
- A complete desktop shell (boot screen, desktop, taskbar, start menu, context menus, windows)
- A virtual multi-drive filesystem with persistence
- A large app suite (44 apps spanning productivity, system tools, games, media, communication)
- A modular feature runtime (core features + plugin features)
- A semantic event bus and command bus for loose coupling
- A full scripting language (RetroScript) with autoexec startup support
- Real-time multiplayer via WebSocket (PHP sidecar) with rooms, presence, game sessions, and collaborative apps
- Optional PHP backend for admin config/auth (v1 file-based) or MySQL-backed multi-user backend (v2) with real-time events, webhooks, and audit logging

## Current architecture at a glance

### Boot pipeline
`index.js` initializes the system in ordered phases:
1. Load config (`ConfigLoader`)
2. Initialize user session and real-time SSE connection (v2 API only)
3. Register apps (`AppRegistry`)
4. Initialize core services (`StorageManager`, `StateManager`, `WindowManager`, `CommandBus`, `ScriptEngine`)
5. Sync filesystem shortcuts and installed apps
6. Register and initialize features (`FeatureRegistry`)
7. Load plugin manifest and plugin features (`PluginLoader`)
8. Initialize all features (core + plugin)
9. Initialize UI renderers
10. Apply persisted settings
11. Install global handlers
12. Run `autoexec.retro`

Boot health diagnostics are collected per-component and exposed at `window.__OS_BOOT_HEALTH`.

### Core systems
- `core/SemanticEventBus.js`: the single event bus — pub/sub with middleware, request/response, channels, async streams, schema validation, legacy name mapping. (`core/EventBus.js` is a re-export so old imports keep working.)
- `core/CommandBus.js`: scriptable system command endpoint (a thin parallel to the event bus; consolidation is on the roadmap).
- `core/FileSystemManager.js`: virtual filesystem and file operations (with server-backed file sync)
- `core/StateManager.js`: runtime state + persistence hooks; `resetVolatile()` clears user-scoped in-memory state for clean user-switch
- `core/SessionManager.js`: **single owner of the logout / user-switch cascade** — sequences realtime/presence/token/state teardown so subscribers never see a half-torn-down session
- `core/WindowManager.js`: window lifecycle, focus/z-order, deterministic modal cleanup (no listener races on rapid close)
- `core/FeatureRegistry.js` + `core/FeatureBase.js`: feature lifecycle/runtime toggling; serialized enable/disable, isolated-failure dependent disable, no init reset on disable
- `core/PluginLoader.js`: plugin manifest, dynamic load/unload
- `core/ConfigLoader.js`: configuration loading with backend/default fallback; session token API
- `core/RealtimeClient.js`: SSE real-time event bridge (v2 API)
- `core/NarrativeStateManager.js`: campaign/scene/objective/flag/clue state with multiplayer sync
- `core/MultiplayerClient.js`: WebSocket client with auto-reconnect, room/presence management; **token passed via `Sec-WebSocket-Protocol`, never in the URL**
- `core/PresenceManager.js`: online user tracking, status, and typing indicators
- `core/GameSession.js`: multiplayer game lifecycle (lobby, turn management, state sync)
- `core/TelemetryCollector.js`: event capture, scene funnels, puzzle analytics
- `core/ReplayEngine.js`: deterministic replay from telemetry streams
- `core/MediaAssetManager.js` + `core/MediaCueGraph.js`: multimedia asset pipeline and cue orchestration
- `core/script/*`: RetroScript lexer/parser/interpreter/builtins
- `core/script/utils/PathValidation.js`: **single allowlist** for script-driven file ops (also used by the SSE remote FS handler)

### Major extension points
- **Apps:** `/apps/*.js`, registered in `apps/AppRegistry.js`
- **Features:** classes extending `core/FeatureBase.js`
- **Plugins:** manifests in `/plugins/features/<plugin>/index.js`
- **Scripts:** `.retro` files run via Script Runner, terminal, or autoexec

## Project structure

```text
.
├── index.js / index.html          # boot + shell
├── apps/                          # first-party apps (40+ apps)
├── core/                          # platform runtime systems
│   ├── script/                    # RetroScript engine internals
│   └── schema/                    # modular event schema definitions
├── features/                      # built-in system features
├── plugins/features/              # plugin-based features
├── ui/                            # desktop/taskbar/start/context renderers
├── styles/                        # modular CSS
├── config/                        # defaults + backend override examples
├── api/                           # PHP API v1 (config/auth/save/queue)
│   └── v2/                        # REST API v2 router (MySQL backend)
├── backend/                       # MySQL-backed backend v2
│   ├── controllers/               # Auth, Config, User, System, Theme, Event, Webhook, Audit, File, Game, Multiplayer, Presence, Social, Message
│   ├── models/                    # User, Session, Config, Theme, Event, Webhook, AuditLog, UserFile, UserStateSnapshot, Room, GameSession, GamePlayer, Leaderboard, Friendship, ChatMessage, DirectMessage
│   ├── services/                  # EventService, SSEBroadcaster, WebhookDispatcher, FileStorageService
│   └── migrations/                # 19 SQL migration files
├── websocket/                     # PHP WebSocket sidecar (multiplayer transport)
│   ├── server.php                 # WebSocket server entry point (pure PHP)
│   ├── WebSocketFrame.php         # RFC 6455 frame encoding/decoding
│   ├── auth.php                   # Token validation against PHP API
│   ├── rooms.php                  # Room management logic
│   └── handlers.php               # Per-message-type handlers
├── admin/                         # web admin panel + component-based UI
│   └── assets/components/         # Dashboard, UserManager, ThemeCreator, etc.
├── assets/                        # media resources (sounds, videos)
├── data/                          # runtime data storage
├── docs/                          # focused docs (terminal scripting, events, stability, assets)
├── setup.php                      # first-run setup wizard
├── test-backend.php               # backend API test suite
├── DEVELOPER_GUIDE.md
└── SCRIPTING_GUIDE.md
```

## Run locally

### Frontend only
```bash
python -m http.server 8000
# open http://localhost:8000
```

### With PHP backend v1 (file-based admin config and auth)
```bash
php -S localhost:8000
# open http://localhost:8000
```

### With MySQL backend v2 (multi-user, real-time events, webhooks)
```bash
# 1. Copy and configure environment
cp backend/env.example.php backend/env.php
# Edit backend/env.php with your MySQL credentials

# 2. Run migrations
php backend/migrate.php

# 3. Seed default admin user (optional)
php backend/seed.php

# 4. Start server
php -S localhost:8000

# 5. First-run setup wizard (optional)
# Visit http://localhost:8000/setup.php
```

### Vendor CDN assets locally (automatic)
```bash
# Fetch configured CDN assets (Font Awesome + Google Fonts by default),
# localize CSS dependencies, and rewrite source file CDN URLs to local paths
python scripts/fetch_cdn_assets.py
```

This workflow is driven by `config/cdn-assets.json`. Add any additional CDN URL + output pairs there and rerun the script.

### Queue API for remote turn-based control
When running with PHP, `/api/queue.php` provides a server-authoritative queue with:
- Atomic updates via file locking (`flock`) for concurrent users
- Automatic purge of timed-out queued users
- Automatic expiry/rotation of active turns
- Deterministic next-player promotion

Basic usage:
```bash
# Join queue
curl -X POST -d 'action=join&userId=user123&name=Player%201' http://localhost:8000/api/queue.php

# Keepalive heartbeat (queued or active users)
curl -X POST -d 'action=heartbeat&userId=user123' http://localhost:8000/api/queue.php

# Complete turn and promote next player
curl -X POST -d 'action=complete&userId=user123' http://localhost:8000/api/queue.php

# Read shared queue/turn state for all clients/watchers
curl 'http://localhost:8000/api/queue.php?action=status'
```

## Documentation map

- `CLAUDE.md` — project instructions and conventions for contributors (and AI assistants)
- `DEVELOPER_GUIDE.md` — authoritative guide for adding apps, features, plugins, and script-driven experiences
- `SCRIPTING_GUIDE.md` — RetroScript language, runtime, events, and patterns
- `docs/UNIFIED_ROADMAP.md` — the plan for converging on a single unified API surface (sequenced waves, success criteria, deferred items)
- `docs/ARCHITECTURE_AUDIT.md` — original architecture audit; resolved items are annotated, open items link to the roadmap
- `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` — complete event, command, and query reference for scripting
- `docs/TERMINAL_SCRIPTING.md` — terminal-specific scripting built-ins and workflows
- `docs/GREENGEEKS_RESELLER_VPS_WEBSOCKET_SETUP.md` — GreenGeeks reseller VPS deployment guide for the WebSocket sidecar
- `plugins/features/dvd-bouncer/README.md` — concrete plugin example
- `backend/env.example.php` — backend v2 environment configuration template
- `assets/sounds/README.md`, `assets/music/README.md`, `assets/videos/README.md` — media auto-discovery conventions

## Adding new capabilities quickly

### Add an app
1. Create `apps/MyApp.js` extending `AppBase`
2. Register it in `apps/AppRegistry.js`
3. Add styling in `styles/apps/my-app.css` and import it from `styles/main.css` when needed

### Add a feature
1. Create a class extending `FeatureBase`
2. Register via `FeatureRegistry.register(...)` in boot flow or via plugin
3. Define settings metadata if you want runtime configuration UI

### Add a plugin
1. Create `plugins/features/my-plugin/`
2. Add manifest `index.js` exporting `{ id, features, apps?, onLoad?, onUnload? }`
3. Add plugin path to config (`config/defaults.json` plugin list) or manifest source

### Add RetroScript automation / “script apps”
1. Create a `.retro` script under a virtual path (e.g. `C:/Scripts`) or repo root for autoexec
2. Use events (`on ...`), built-ins (`launch`, `emit`, `read`, `write`, `terminal*`) and command bus integrations
3. Launch from Script Runner, terminal (`retro <path>`), or autoexec

## Application suite (44 apps)

| Category | Apps |
|----------|------|
| **Productivity** | Notepad, Browser, Calculator, Calendar, Clock, HyperCard |
| **Communication** | Inbox (email), Phone, Instant Messenger, Chat Room |
| **Media** | Media Player (audio + video), Paint |
| **Games** | Minesweeper, Solitaire, FreeCell, Snake, Asteroids, SkiFree, Zork, Doom, Tetris |
| **Multiplayer** | Game Lobby |
| **System Tools** | Terminal, My Computer, Recycle Bin, Task Manager, Find Files, Defrag, Run Dialog, Help System, Script Runner |
| **Narrative/ARG** | Campaign Studio, Timeline Editor, Showrunner Console |
| **Settings** | Control Panel, Display Properties, Sound Settings, Features Settings, Admin Panel |

## Built-in features (12 + plugins)

| Feature | Description |
|---------|-------------|
| Sound System | Centralized audio with MP3 support and synthesized fallbacks |
| Achievement System | Unlock milestones with toast notifications |
| Clippy Assistant | Context-aware paperclip assistant with personality |
| Desktop Pet | Animated companion (neko, dog, sheep) with physics |
| Screensaver | Idle screensaver (toasters, starfield, marquee) |
| Easter Eggs | Konami code, cheat codes, and hidden features |
| System Dialogs | Windows 95 style alert, confirm, prompt, file open/save, run, shutdown dialogs |
| Campaign Manager | ARG campaign lifecycle, package install/uninstall |
| Mood Orchestrator | Atmosphere presets, adaptive scoring, CSS effects |
| Online Users | System tray presence indicator for multiplayer |
| Notifications | Toast notifications, sound alerts, taskbar flash |
| DVD Bouncer (plugin) | Bouncing DVD logo screensaver plugin |

## Notes on current state

- The project is dependency-light and buildless (native ES modules, zero external dependencies; PHP WebSocket sidecar for multiplayer).
- The PHP backend is optional; frontend works without it using defaults/fallbacks.
- Backend v2 adds MySQL-backed user accounts, real-time SSE events, webhooks, themes, announcements, file uploads, and audit logging.
- Multiplayer is provided by a PHP WebSocket sidecar that authenticates against the PHP API. When unavailable, all apps degrade gracefully to single-player mode.
- Multiplayer client defaults to same-origin `/ws` (or configurable `multiplayer.websocketPath`) for reverse-proxy-friendly HTTPS deployments; set `multiplayer.websocketUrl` for explicit endpoints.
- **WebSocket authentication** is via `Sec-WebSocket-Protocol: token.<hex>`; the legacy `?token=` query string is still accepted server-side but new clients should not use it.
- **User session lifecycle** is unified through `SessionManager` (`logout()` / `switchUser()`). Listening for `user:login` / `user:logout` / `user:switch` / `auth:expired` events is the canonical hook for session-scoped resources.
- **Feature lifecycle**: `FeatureBase.disable()` does not reset `initialized`. Concurrent `enable()`/`disable()` calls are serialized via a per-feature lifecycle queue. Dependent disable in `FeatureRegistry` isolates per-feature failures so one broken cleanup doesn't half-disable the graph.
- **Multi-window apps** must use `setInstanceState()` / `getInstanceState()`. Apps that still hold per-window data on `this` (currently Terminal) are forced `singleton: true` until migrated.
- **Modal cleanup** runs synchronously inside `WindowManager.close()` via a per-window callback map — no more one-shot listener races on rapid close.
- Plugin loading uses a config-driven manifest generated during boot.
- RetroScript and app/plugin systems are fully integrated through event + command layers.
- The event schema is modularized into domain-specific files under `core/schema/` (window, app, system, UI, desktop, sound, filesystem, game, dialog, notification, feature, settings, SSE, narrative, multimedia, and user-session events).
- A backend test suite (`test-backend.php`) and a RetroScript engine harness (`scripts/test-retroscript.mjs`) provide automated smoke coverage.
- Boot health diagnostics track per-component status, duration, and errors for debugging.
- **Script-driven and SSE-driven file operations** share one allowlist (`core/script/utils/PathValidation.js`). Adding a new safe root requires only one edit.
- Multiplayer state sync uses a re-broadcast guard (`_isProcessingRemoteUpdate`) to prevent infinite loops.

See `docs/UNIFIED_ROADMAP.md` for what's still planned (SubscriptionManager, CommandBus → SemanticEventBus consolidation, EventTopology, fetchWithAuth, full per-window state for Terminal, etc.) and the order in which it lands.
