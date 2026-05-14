# CLAUDE.md — IlluminatOS! (newRetroOS)

## Project Overview

IlluminatOS! is a Windows 95-themed desktop OS emulator running in the browser. It features a full windowing system, 40+ apps, a virtual filesystem, multiplayer support via WebSocket, a custom scripting language (RetroScript), plugin system, campaign/narrative engine, and a PHP REST API backend with admin panel.

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3 — no build step, no framework
- **Backend**: PHP (no framework), PDO/MySQL, token-based auth
- **Realtime**: Pure PHP WebSocket server (RFC 6455), Server-Sent Events (SSE)
- **Scripting**: RetroScript — custom `.retro` scripting language
- **Server**: Apache (`.htaccess`) or PHP built-in server

## Repository Structure

```
index.html          # Single-page app entry point
index.js            # Boot orchestration and initialization sequence
autoexec.retro      # Default startup script (RetroScript)
setup.php           # Setup wizard for first-time deployment

core/               # Core systems (EventBus, StateManager, WindowManager, etc.)
  schema/           # Event schema definitions (18 files)
  script/           # RetroScript engine (lexer, parser, interpreter)
apps/               # 44 application modules (extend AppBase)
features/           # 12 feature modules (extend FeatureBase)
ui/                 # 4 UI renderers (Desktop, Taskbar, StartMenu, ContextMenu)
styles/             # 53 CSS files (modular, one per app/component)
plugins/            # Plugin system with manifest-based loading
campaigns/          # Campaign/narrative content packages

backend/            # PHP backend (controllers, models, services, middleware)
  controllers/      # REST endpoint handlers
  models/           # Data access (static methods, direct SQL)
  services/         # EventService, WebhookDispatcher, SSEBroadcaster, FileStorage
api/                # API entry points (v2/index.php is the main router)
  v2/               # RESTful API v2 (single-entry-point routing)
admin/              # Admin dashboard (single HTML page + JS)
websocket/          # Pure PHP WebSocket server and handlers
config/             # Runtime config (credentials, overrides — mostly gitignored)
data/               # Runtime data (rate limits, uploads)
assets/             # Static media (sounds/, music/, videos/)
scripts/            # Dev utility scripts
docs/               # Internal design documents and audits
backups/            # Auto-generated backups (gitignored)
```

## Development Setup

### Frontend only (no backend)
```bash
python -m http.server 8000
```

### With PHP backend v2 (full features)
```bash
cp backend/env.example.php backend/env.php
# Edit backend/env.php with MySQL credentials
php backend/migrate.php
php backend/seed.php          # optional: seed default admin
php -S localhost:8000
```

### WebSocket server
```bash
php websocket/server.php      # typically port 8081
```

## Testing

### Backend API tests
```bash
php test-backend.php [base-url]       # Smoke tests for all API endpoints
php test-security.php [base-url]      # Security/authorization tests
```

### Linting
```bash
bash scripts/lint-innerhtml.sh        # Detect unsafe innerHTML usage
```

### Manual validation checklist
1. Start server and open in browser
2. Check boot console logs for errors
3. Test app launch from Start menu and terminal
4. Verify no uncaught errors in browser console
5. Test persistence by reload
6. Check `window.__OS_BOOT_HEALTH` in console for per-component diagnostics

## Architecture Patterns

### Frontend

- **Event-driven**: Central `EventBus` (pub/sub) with `SemanticEventBus` for schema-validated events
- **State management**: `StateManager` with reactive subscriptions and `resetVolatile()` for clean user-switch
- **Singletons**: Core systems exported as `export default new ClassName()`
- **AppBase**: All apps extend `AppBase` with lifecycle methods (`onOpen`, `onClose`, `onFocus`, `onBlur`, `onMount`). Multi-instance apps **must** use `setInstanceState()` / `getInstanceState()` — apps that still hold per-window data on `this` must declare `singleton: true` until migrated.
- **FeatureBase**: Background features extend `FeatureBase` with `initialize()`, `enable()`, `disable()`, `cleanup()`. `disable()` does **not** reset `initialized` — re-enable will not re-run `initialize()`; subclasses that genuinely need re-init must override `disable()` to clear it explicitly. Concurrent enable/disable calls are serialized by an internal lifecycle queue, so two clicks can't double-run `initialize()`.
- **CommandBus**: Command routing and execution (currently parallel to `SemanticEventBus`; see roadmap for planned consolidation).
- **SessionManager**: Single owner of the logout / user-switch cascade. Always call `SessionManager.logout()` or `SessionManager.switchUser(newUser)` instead of tearing down realtime/presence/state by hand. Cascade order is: `MultiplayerClient.disconnect` → `closeRealtime` → `PresenceManager.destroy` → `setSessionToken(null)` → `StateManager.resetVolatile`, then `user:logout` / `user:switch` emitted for subscribers.
- **Virtual filesystem**: `FileSystemManager` with permissions, locking, events.
- **Script path validation**: `core/script/utils/PathValidation.validateScriptPath()` is the single allowlist for script-driven file ops; reuse it instead of inlining new prefix lists.

### Backend

- **Single entry point**: All v2 API requests route through `api/v2/index.php`
- **MVC-ish**: Controllers → Models → Database (PDO singleton)
- **Static model methods**: Models use static methods for data access, no ORM
- **Middleware chain**: Auth, rate limiting, JSON parsing, CORS
- **Three-tier config**: `defaults.json` → system_config DB → user_config DB (deep merged)
- **Event-driven**: `EventService::dispatch()` → DB log → webhooks → SSE
- **WebSocket auth**: Tokens travel via `Sec-WebSocket-Protocol: token.<hex>` (the only request header browsers let JS set on a WS upgrade). The server (`websocket/server.php`) still accepts `Authorization: Bearer` and legacy `?token=` query params for compatibility, but new clients must use the subprotocol form so tokens stay out of URLs / proxy logs / browser history.

### Data flow
```
User Interaction → UI Handler → EventBus.emit() → StateManager update
→ StorageManager persist → Subscriber callbacks → UI re-render
```

### User session lifecycle

The session lifecycle is unified through `SessionManager` plus four canonical events:

| Event | When it fires | Purpose |
|---|---|---|
| `user:login` | After token set, storage rescoped, `StateManager.initialize()` complete | Subscribers can safely hit the network as the new user |
| `user:logout` | After realtime/presence/token/state teardown | Late subscribers can drop session caches |
| `user:switch` | After teardown but before new scope is hydrated | Subscribers can clear caches before rehydrate |
| `auth:expired` | Server returned 401; token cleared | Show reauth UI (handler not yet implemented — see roadmap) |

Never tear down `MultiplayerClient`, `RealtimeClient`, or `PresenceManager` directly from a UI handler — go through `SessionManager`.

## Coding Conventions

### Naming
- **Classes**: PascalCase (`Calculator`, `EventBus`)
- **Functions/methods**: camelCase (`getState`, `createWindow`)
- **Constants**: UPPER_SNAKE_CASE (`WINDOW`, `DESKTOP`)
- **CSS classes**: kebab-case (`.window-manager`, `.start-menu`)
- **Files**: Match class name or describe role
- **DB columns**: snake_case
- **JSON API responses**: camelCase

### JavaScript
- ES Module imports at top, grouped by: core → UI → apps → features
- No build step — raw ES modules served directly
- HTML generation must use `escapeHtml()` / `escAttr()` for user data (XSS prevention)
- Files using `.innerHTML =` must import sanitize utilities (enforced by lint script)

### CSS
- One file per app in `styles/apps/`
- Shared components in `styles/components/`
- Theme variables in `styles/core/variables.css`
- Import order matters: core → effects → features → layout → components → apps

### PHP
- Prepared statements for all SQL (no raw interpolation)
- `jsonResponse()` / `jsonError()` helpers for API responses
- `input($key, $default)` for request body access
- Password hashing: `PASSWORD_BCRYPT` with cost=12
- Rate limiting: file-based sliding window with `flock()`

## Security Guidelines

- **Never** interpolate user input into SQL — use prepared statements
- **Never** set `.innerHTML` with unescaped user data — use `escapeHtml()`
- **Never** commit `backend/env.php`, `config/admin-credentials.php`, or `config/overrides.json`
- **Never** put session tokens in URLs (query strings, fragments). For WebSocket auth, pass the token via `Sec-WebSocket-Protocol: token.<hex>`.
- **Always** route script-initiated file ops through `validateScriptPath()` (or `ScriptEngine.validateScriptPath()`). Don't inline a new allowlist.
- Config section validation strips HTML, blocks `url()`, `javascript:`, `expression()` in CSS
- WebSocket messages are rate-limited (30/sec) and size-limited (64 KB)
- API rate limiting is per-user/IP with configurable windows
- Max request body: 512 KB

## Adding New Components

### New App
1. Create `apps/MyApp.js` extending `AppBase`
2. Implement `onOpen()` (return HTML), `onClose()` (cleanup)
3. Register in `apps/AppRegistry.js`
4. Add CSS in `styles/apps/my-app.css` and import in styles
5. Add to Start menu config if needed

### New Feature
1. Create `features/MyFeature.js` extending `FeatureBase`
2. Implement `initialize()`. Don't reimplement enable/disable unless you have a specific reason — the base class handles state, lifecycle locking, and cleanup wiring.
3. Override `cleanup()` (called from `disable()`) to release listeners/timers/DOM. Anything you register through `this.subscribe(...)` / `this.addHandler(...)` is auto-cleaned.
4. Register in `features/` index (or via plugin manifest).
5. Provide metadata: id, name, description, icon, category, optional `dependencies`, optional `settings` schema for the UI.

> ⚠️ Do **not** assume `initialize()` will re-run if your feature is toggled off and back on. It only runs once per process. If you need re-init semantics, override `disable()` to set `this.initialized = false` before calling `super.disable()`.

### New Plugin
1. Create `plugins/features/my-plugin/index.js` with manifest
2. Export `{ id, name, version, features: [], apps: [], onLoad, onUnload }`
3. Add feature/app classes in the plugin directory

### New API Endpoint
1. Add controller method in `backend/controllers/`
2. Register route in `api/v2/index.php`
3. Apply appropriate middleware (auth, rate limiting)
4. Use `EventService::dispatch()` for auditable actions

## Key Files

| File | Purpose |
|------|---------|
| `index.js` | Boot sequence and initialization |
| `core/EventBus.js` | Re-export of `SemanticEventBus` (single canonical event bus) |
| `core/SemanticEventBus.js` | Pub/sub + schema validation + middleware + legacy mapping |
| `core/StateManager.js` | Reactive state store; `resetVolatile()` clears user-scoped in-memory state |
| `core/SessionManager.js` | Logout / user-switch cascade owner |
| `core/WindowManager.js` | Window lifecycle, modal stack, deterministic modal cleanup |
| `core/FileSystemManager.js` | Virtual filesystem |
| `core/ConfigLoader.js` | Backend config + session token API |
| `core/MultiplayerClient.js` | WebSocket client (subprotocol auth, auto-reconnect) |
| `core/RealtimeClient.js` | SSE bridge for backend v2 events |
| `core/PresenceManager.js` | Online users + typing state |
| `core/script/ScriptEngine.js` | RetroScript engine coordinator |
| `core/script/utils/PathValidation.js` | Single allowlist for script file-op paths |
| `apps/AppBase.js` | Base class for all applications |
| `core/FeatureBase.js` | Base class for all features (lifecycle queue, no init reset on disable) |
| `core/FeatureRegistry.js` | Feature registration, isolated-failure dependent disable |
| `api/v2/index.php` | API v2 router (all backend routes) |
| `backend/bootstrap.php` | Backend initialization + helpers |
| `backend/Router.php` | Lightweight REST router |
| `backend/Middleware.php` | Auth, rate limiting, CORS |
| `backend/Database.php` | PDO singleton wrapper |
| `websocket/server.php` | WebSocket server entry point (subprotocol auth) |
| `websocket/WebSocketFrame.php` | RFC 6455 framing + auth header parsing |
| `setup.php` | First-time setup wizard |
| `autoexec.retro` | Default startup automation script |

## Event System

Events use namespaced format: `window:open`, `app:close`, `ui:menu:start:toggle`, etc. Schemas live in `core/schema/` with validation. `SemanticEventBus` provides middleware, logging, request/response, channels, and legacy name mapping. There is no separate `EventBus` implementation — `core/EventBus.js` is a re-export so old imports keep working.

The canonical user-session events are `user:login`, `user:logout`, `user:switch`, `auth:expired` (see `core/schema/system.js`).

> ⚠️ Avoid relying on `LEGACY_EVENT_MAPPING` in new code. Use the new names directly (`ui:menu:start:toggle`, `system:ready`, `feature:pet:toggle`, etc.). The mapping table in `SemanticEventBus.js` is for compatibility with already-written code and is on the roadmap for removal.

## RetroScript

Custom scripting language (`.retro` files) for automation. See `SCRIPTING_GUIDE.md` for full documentation. Engine lives in `core/script/` with lexer, parser, and interpreter.

Script file ops (`write` / `read` / `delete` / `mkdir`) validate paths against the shared allowlist in `core/script/utils/PathValidation.js`. The allowlist also covers the SSE-driven remote FS ops in `index.js`. Don't inline new prefix arrays — add to `PathValidation` and have both call-sites use it.

## Existing Documentation

- `README.md` — Project overview, run instructions, app/feature catalog
- `DEVELOPER_GUIDE.md` — Extension development guide (apps, features, plugins, RetroScript)
- `SCRIPTING_GUIDE.md` — Complete RetroScript language reference
- `docs/UNIFIED_ROADMAP.md` — Plan for converging on the unified API (sequenced waves, deferred items, success criteria)
- `docs/ARCHITECTURE_AUDIT.md` — Original architecture audit + which findings are resolved
- `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` — Exhaustive event/command/query reference for scripts
- `docs/TERMINAL_SCRIPTING.md` — Terminal-specific RetroScript built-ins and workflows
- `docs/GREENGEEKS_RESELLER_VPS_WEBSOCKET_SETUP.md` — Production WebSocket sidecar deployment guide

This file, `README.md`, `DEVELOPER_GUIDE.md`, and `docs/UNIFIED_ROADMAP.md` are the source of truth for architecture and conventions. Historical planning docs have been folded into the roadmap or removed.
