# CLAUDE.md — IlluminatOS! (newRetroOS)

## Project Overview

IlluminatOS! is a Windows 95-themed desktop OS emulator running in the browser. It features a full windowing system, 42 apps, a virtual filesystem, multiplayer support via WebSocket, a custom scripting language (RetroScript), plugin system, campaign/narrative engine, and a PHP REST API backend with admin panel.

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
apps/               # 42 application modules (extend AppBase)
features/           # 13 feature modules (extend FeatureBase, incl. ReauthGate)
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
docs/               # Reference docs (scripting, deployment, campaign content)
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
php backend/migrate.php       # CLI runner; web equivalent: api/v2/migrate.php
php -S localhost:8000
# Then visit http://localhost:8000/setup.php to create the default admin
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

### Aggregated CI gate
```bash
bash scripts/ci-gate.sh                # Runs all 5 gates: JS syntax, PHP lint,
                                       # innerHTML safety, RetroScript harness,
                                       # event-schema coverage
```

### Manual validation checklist
1. Start server and open in browser
2. Check boot console logs for errors
3. Test app launch from Start menu and terminal
4. Verify no uncaught errors in browser console
5. Test persistence by reload
6. Check `window.__OS_BOOT_HEALTH` in console for per-component diagnostics
7. Check `window.__OS_HEALTH` for the live HealthMonitor snapshot (subscription
   accounting, storage telemetry, event-bus stats, feature posture, realtime
   state, recent faults). `degraded` reasons (`boot` / `validationErrors` /
   `failedFeatures` / `faults` / `subscriptionLeak`) make triage deterministic.

## Architecture Patterns

### Frontend

- **Event-driven**: Central `EventBus` (pub/sub) with `SemanticEventBus` for schema-validated events. `SemanticEventBus` also owns the unified command registry — call `EventBus.registerCommand(name, handler)` and `EventBus.executeCommand(name, payload)`. Platform-level handlers (`command:fs:*`, `command:window:*`, `command:terminal:*`, `command:dialog:*`, etc.) plus `query:*` listeners and `timer:*` / `macro:*` lifecycle state live in `core/CommandRegistry.js`, which boot initialises once. Every script-engine call site routes through `EventBus.executeCommand`.
- **State management**: `StateManager` with reactive subscriptions and `resetVolatile()` for clean user-switch. For persisted paths (`icons`, `settings.sound`, etc.) use `setStateAndPersist(path, value)` to avoid state↔storage drift — it writes storage first and only commits the in-memory change if the write succeeds.
- **Storage hardening**: `StorageManager.set/get/setGlobal/getGlobal` reject any payload containing `__proto__` / `constructor` / `prototype` keys at any depth (rejections tallied in `telemetry.unsafeKeyRejections`). During a remote snapshot hydration, UI-driven `.set()` calls are dropped (tallied in `telemetry.hydrationDrops`); the hydrator uses `beginHydration()` / `hydrationSet(key, value)` / `endHydration()` to write the incoming payload without tripping the guard. Before `setUserScope(name)` resolves, `.set()` writes are queued (`telemetry.preLoginWrites`) instead of leaking to global storage; on login the queue is replayed under the user prefix with set-if-missing semantics (`telemetry.preLoginReplays`) so a returning user's existing data isn't clobbered. `setGlobal()` always writes through — that's the explicit cross-user path.
- **Singletons**: Core systems exported as `export default new ClassName()`
- **Subscription ownership**: `SubscriptionManager` (`core/SubscriptionManager.js`) tracks every `EventBus.on()` and `StateManager.subscribe()` return against the active owner. Set the owner via `SubscriptionManager.runAs(ownerId, fn)` — `AppBase` does this around `onOpen`/`onMount` (owner = windowId), `FeatureBase` around `initialize()` (owner = featureId), `PluginLoader` around `onLoad()` (owner = pluginId). On close/disable/unload/logout, `SubscriptionManager.unsubscribeAll(ownerId)` releases everything. The existing `this.subscribe()` / `this.onEvent()` helpers in AppBase/FeatureBase still work — SubscriptionManager is an additional safety net for raw `.on()` calls inside lifecycle code.
- **AppBase**: All apps extend `AppBase` with lifecycle methods (`onOpen`, `onClose`, `onFocus`, `onBlur`, `onMount`). Multi-instance apps **must** use `setInstanceState()` / `getInstanceState()` — every app in the tree has been audited and either uses per-instance state or is `singleton: true` deliberately. `AppBase.setContent()` releases any `addHandler()`-registered listener whose target sits inside the replaced subtree before swapping HTML, so re-rendered content can't leak handlers pointing at detached nodes.
- **FeatureBase**: Background features extend `FeatureBase` with `initialize()`, `enable()`, `disable()`, `cleanup()`. `disable()` does **not** reset `initialized` — re-enable will not re-run `initialize()`; subclasses that genuinely need re-init must override `disable()` to clear it explicitly. Concurrent enable/disable calls are serialized by an internal lifecycle queue, so two clicks can't double-run `initialize()`.
- **CommandRegistry**: `core/CommandRegistry.js` is the wiring layer that registers every platform-level command handler (`command:fs:*`, `command:window:*`, `command:terminal:*`, `command:dialog:*`, `command:app:*`, `command:setting:*`, `command:sound:play`, etc.), the `query:*` listeners, and the `timer:*` / `macro:*` lifecycle handlers. It owns the runtime timer/macro state (`timers` Map, `macros` Map, recording flags). The public API is `EventBus.registerCommand()` / `EventBus.executeCommand()` — `CommandRegistry` is not an alternative API, it's where the boot-time platform handlers live. The script engine takes `EventBus`, `FileSystemManager`, etc. in its context (`ScriptEngine.initialize({ EventBus, FileSystemManager, ... })`); every visitor and media/system builtin goes through `EventBus.executeCommand`.
- **SessionManager**: Single owner of the logout / user-switch cascade. Always call `SessionManager.logout()` or `SessionManager.switchUser(newUser)` instead of tearing down realtime/presence/state by hand. Cascade order is: `MultiplayerClient.disconnect` → `closeRealtime` → `PresenceManager.destroy` → `setSessionToken(null)` → `SubscriptionManager.unsubscribeAll('session')` → `StateManager.resetVolatile`, then `user:logout` / `user:switch` emitted for subscribers. At first-login the boot flow calls `SessionManager.attachInitialUser(name)` — sets the scope + emits `user:switch` *without* running the teardown (no token to clear, no realtime to close), keeping the freshly-issued session token intact.
- **Authenticated HTTP**: `fetchWithAuth(input, init)` from `ConfigLoader.js` is the single way to call the v2 API. Adds `Authorization: Bearer <token>` and `X-Requested-With: XMLHttpRequest` automatically, and on 401 routes through `SessionManager.logout({ reason: 'auth_expired' })` so the frontend stops looping with a stale token. Pass `skipAuth: true` in the init object for endpoints that intentionally don't carry the session (login, register).
- **Cross-process event topology**: `core/EventTopology.js` is the single registry of every backend event bridged to the frontend (`{ backend, frontend?, transports, description? }`). `RealtimeClient` derives its allowlist from this list — adding a new SSE event means adding one topology entry, not editing three files. When a topology entry sets `frontend`, RealtimeClient emits both `sse:<backend>` (legacy alias for existing handlers in `index.js`) and the semantic frontend name (subscribe to this in new code).
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
| `auth:expired` | `fetchWithAuth` saw a 401; teardown ran; token cleared | `features/ReauthGate.js` surfaces a reauth prompt (with a single-flight guard) and re-runs `LoginScreen.show()` |

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
- **Always** route script-initiated and command-initiated file ops through `validateScriptPath()` (or `ScriptEngine.validateScriptPath()`). The script engine, the SSE remote-FS handler in `index.js`, and the `command:fs:*` handlers in `CommandRegistry.js` all share this single allowlist.
- **Never** store user-controlled JSON in `localStorage` (or hand it to `StorageManager`) without going through `StorageManager.set` — its prototype-pollution guard rejects payloads with `__proto__` / `constructor` / `prototype` keys.
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

> ⚠️ The plugin manifest is validated before registration (`PluginLoader._validatePluginManifest`). `id` must match `/^[a-zA-Z0-9._-]+$/` and be ≤64 chars. Duplicate feature/app IDs within the manifest, declared `feature.dependencies` that don't resolve, and non-function `onLoad`/`onUnload` are all rejected up front. The loader is transactional: `loaded: true` is set only after `onLoad()` plus every feature/app registration succeed — a failed load rolls back precisely what it registered and runs `onUnload()` for symmetry.

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
| `core/SemanticEventBus.js` | Pub/sub + schema validation + middleware + legacy mapping + unified command registry |
| `core/StateManager.js` | Reactive state store; `resetVolatile()` clears user-scoped in-memory state |
| `core/SubscriptionManager.js` | Owner-scoped subscription tracker; `unsubscribeAll(ownerId)` on close/disable/unload/logout |
| `core/EventTopology.js` | Single registry of cross-process events (SSE + WS) |
| `core/SessionManager.js` | Logout / user-switch cascade owner |
| `core/WindowManager.js` | Window lifecycle, modal stack, deterministic modal cleanup |
| `core/FileSystemManager.js` | Virtual filesystem |
| `core/ConfigLoader.js` | Backend config + session token API + `fetchWithAuth()` with 401 trap |
| `core/MultiplayerClient.js` | WebSocket client (subprotocol auth, auto-reconnect) |
| `core/RealtimeClient.js` | SSE bridge for backend v2 events (consumes `EventTopology`) |
| `core/PresenceManager.js` | Online users + typing state |
| `core/HealthMonitor.js` | Live runtime health snapshot exposed at `window.__OS_HEALTH` |
| `core/CommandRegistry.js` | Registers platform `command:*` / `query:*` handlers and owns `timer:*` / `macro:*` lifecycle state; initialised once at boot |
| `core/script/ScriptEngine.js` | RetroScript engine coordinator |
| `core/script/utils/PathValidation.js` | Single allowlist for script file-op paths |
| `apps/AppBase.js` | Base class for all applications |
| `core/FeatureBase.js` | Base class for all features (lifecycle queue, no init reset on disable) |
| `core/FeatureRegistry.js` | Feature registration, isolated-failure dependent disable |
| `api/v2/index.php` | API v2 router. Uses `Router::group($middleware, fn)` to attach `auth + requireRole('admin','superadmin') + rateLimit` once per admin block; controllers don't repeat per-method middleware. |
| `backend/bootstrap.php` | Backend initialization + helpers |
| `backend/Router.php` | Lightweight REST router. Supports global middleware via `use()` and per-route or per-group middleware via the optional 3rd arg / `group()`. |
| `backend/Middleware.php` | Auth, rate limiting, CORS |
| `backend/Database.php` | PDO singleton wrapper |
| `backend/migrate.php` | CLI migration runner (`php backend/migrate.php` / `--status`). Web-based equivalent is `api/v2/migrate.php`. |
| `backend/services/EventService.php` | Records event in event_log + fires webhooks. `sanitizeForExternal()` strips fields like the raw session `token` before SSE/webhook delivery; `sanitizeEventRow()` is the SSE-side helper. The internal `/auth/revocations` endpoint reads from event_log directly so the WS server still sees the full token (protected by `X-Internal-Auth` shared secret). |
| `backend/services/WebhookDispatcher.php` | SSRF-safe webhook delivery. `resolveSafe($host)` rejects any private/loopback/link-local IP; the safe IP is then pinned via `CURLOPT_RESOLVE` to defeat DNS rebinding. `WebhookController::validateUrl` calls the same check at admin-create time so a bad URL is rejected up front. |
| `backend/controllers/CampaignController.php` | Campaign registry + lifecycle. Dispatches `campaign.created/.updated/.deleted/.activated/.deactivated/.published`; the activate/deactivate/publish trio is bridged through `EventTopology` to the frontend. |
| `backend/controllers/TimelineController.php` | Scheduled narrative events. `fireEntry()` dispatches the operator-chosen `event_type` AND a stable `timeline.fired` wrapper carrying the inner type — frontend modules subscribe to `timeline.fired` instead of enumerating every possible inner event. |
| `backend/models/Session.php` | Session storage + revocation. Revocation events embed `token` (used by internal /auth/revocations) and `token_fingerprint` (12-char SHA-256 truncation; safe to expose). The frontend matches `token_fingerprint` via `getSessionTokenFingerprint()` in ConfigLoader. |
| `backend/models/Webhook.php` | Webhook subscription model. `hydrate()` masks the secret by default (returns `secret_set` + `secret_preview`). `findByIdWithSecret()` is the gated path used by the dispatcher and the one-time create response. |
| `admin/assets/components/CampaignManager.js` | Admin UI for campaigns (upload, edit, publish, activate). |
| `admin/assets/components/TimelineManager.js` | Admin UI for scheduled timeline events. |
| `websocket/server.php` | WebSocket server entry point (subprotocol auth) |
| `websocket/WebSocketFrame.php` | RFC 6455 framing + auth header parsing |
| `setup.php` | First-time setup wizard |
| `autoexec.retro` | Default startup automation script |

## Event System

Events use namespaced format: `window:open`, `app:close`, `ui:menu:start:toggle`, etc. Schemas live in `core/schema/` with validation. `SemanticEventBus` provides middleware, logging, request/response, channels, and the unified command registry. There is no separate `EventBus` implementation — `core/EventBus.js` is a one-line re-export so old imports keep working (the re-export is kept indefinitely — see `docs/MIGRATION_ROADMAP.md` for the rationale).

The canonical user-session events are `user:login`, `user:logout`, `user:switch`, `auth:expired` (see `core/schema/system.js`).

> Old aliases like `pet:toggle`, `taskbar:update`, `boot:complete` are no longer auto-rewritten. Use the semantic names directly: `feature:pet:toggle`, `ui:taskbar:update`, `system:ready`. The legacy mapping table is gone — grep is reliable.

Event-schema coverage is enforced in CI: `node scripts/check-event-schema-coverage.mjs` fails if non-app-scoped emitted events drop below 95% schema coverage. The current run is 100%.

## RetroScript

Custom scripting language (`.retro` files) for automation. See `SCRIPTING_GUIDE.md` for the dense top-level reference, and `docs/retroscript/` for a learning-oriented guide, an alphabetical dictionary, and ten progressive tutorials ending in a full mini-ARG campaign. Engine lives in `core/script/` with lexer, parser, and interpreter.

Script file ops (`write` / `read` / `delete` / `mkdir`) validate paths against the shared allowlist in `core/script/utils/PathValidation.js`. The allowlist also covers the SSE-driven remote FS ops in `index.js`. Don't inline new prefix arrays — add to `PathValidation` and have both call-sites use it.

## Existing Documentation

- `README.md` — Project overview, run instructions, app/feature catalog
- `DEVELOPER_GUIDE.md` — Extension development guide (apps, features, plugins, RetroScript)
- `SCRIPTING_GUIDE.md` — Complete RetroScript language reference (dense, table-heavy)
- `docs/retroscript/README.md` — RetroScript documentation hub (learning-oriented guide, alphabetical dictionary, 10 tutorials)
- `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` — Exhaustive event/command/query reference for scripts
- `docs/TERMINAL_SCRIPTING.md` — Terminal-specific RetroScript built-ins and workflows
- `docs/MIGRATION_ROADMAP.md` — Deliberate non-decisions kept as-is (the previously deferred F1/F2/F3 follow-ups are closed)
- `docs/GREENGEEKS_RESELLER_VPS_WEBSOCKET_SETUP.md` — Production WebSocket sidecar deployment guide
- `docs/walkthrough.md`, `docs/required_media.md` — In-world content for the EREBUS campaign in `autoexec.retro`

This file, `README.md`, and `DEVELOPER_GUIDE.md` are the source of truth for architecture and conventions. Historical planning docs (architecture audit, unified roadmap, point-in-time reliability review) have been removed now that the work they tracked is complete.
