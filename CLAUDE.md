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
- **State management**: `StateManager` with reactive subscriptions
- **Singletons**: Core systems exported as `export default new ClassName()`
- **AppBase**: All apps extend `AppBase` with lifecycle methods (`onOpen`, `onClose`, `onFocus`, `onBlur`, `onMount`). Supports multi-instance windows
- **FeatureBase**: Background features extend `FeatureBase` with `initialize()`, `enable()`, `disable()`, `cleanup()`
- **CommandBus**: Command routing and execution
- **Virtual filesystem**: `FileSystemManager` with permissions, locking, events

### Backend

- **Single entry point**: All v2 API requests route through `api/v2/index.php`
- **MVC-ish**: Controllers → Models → Database (PDO singleton)
- **Static model methods**: Models use static methods for data access, no ORM
- **Middleware chain**: Auth, rate limiting, JSON parsing, CORS
- **Three-tier config**: `defaults.json` → system_config DB → user_config DB (deep merged)
- **Event-driven**: `EventService::dispatch()` → DB log → webhooks → SSE

### Data flow
```
User Interaction → UI Handler → EventBus.emit() → StateManager update
→ StorageManager persist → Subscriber callbacks → UI re-render
```

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
2. Implement `initialize()`, `enable()`, `disable()`, `cleanup()`
3. Register in `features/` index
4. Provide metadata: id, name, description, icon, category

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
| `core/EventBus.js` | Central event system |
| `core/StateManager.js` | Reactive state store |
| `core/WindowManager.js` | Window lifecycle management |
| `core/FileSystemManager.js` | Virtual filesystem |
| `core/ConfigLoader.js` | Backend config + session init |
| `core/MultiplayerClient.js` | WebSocket client with auto-reconnect |
| `core/script/ScriptEngine.js` | RetroScript engine coordinator |
| `apps/AppBase.js` | Base class for all applications |
| `features/FeatureBase.js` | Base class for all features |
| `api/v2/index.php` | API v2 router (all backend routes) |
| `backend/bootstrap.php` | Backend initialization + helpers |
| `backend/Router.php` | Lightweight REST router |
| `backend/Middleware.php` | Auth, rate limiting, CORS |
| `backend/Database.php` | PDO singleton wrapper |
| `websocket/server.php` | WebSocket server entry point |
| `setup.php` | First-time setup wizard |
| `autoexec.retro` | Default startup automation script |

## Event System

Events use namespaced format: `window:open`, `app:close`, `ui:menu:start:toggle`, etc. Schemas are defined in `core/schema/` with validation. The SemanticEventBus provides middleware, logging, and legacy event mapping.

## RetroScript

Custom scripting language (`.retro` files) for automation. See `SCRIPTING_GUIDE.md` for full documentation. Engine lives in `core/script/` with lexer, parser, and interpreter.

## Existing Documentation

- `README.md` — Project overview, run instructions, app/feature catalog
- `DEVELOPER_GUIDE.md` — Extension development guide (apps, features, plugins, RetroScript)
- `SCRIPTING_GUIDE.md` — Complete RetroScript language reference
- `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` — Exhaustive event/command/query reference for scripts
- `docs/TERMINAL_SCRIPTING.md` — Terminal-specific RetroScript built-ins and workflows
- `docs/GREENGEEKS_RESELLER_VPS_WEBSOCKET_SETUP.md` — Production WebSocket sidecar deployment guide

Historical planning and phase-audit docs have been removed; this file, `README.md`, and `DEVELOPER_GUIDE.md` are the source of truth for architecture and conventions.
