# IlluminatOS! Developer Guide

This guide documents the **current** development workflow for extending IlluminatOS with apps, features, plugins, and RetroScript-driven experiences.

For the longer-term plan to unify legacy APIs (CommandBus → SemanticEventBus, owner-scoped subscriptions, EventTopology, 401-aware fetch), see [`docs/UNIFIED_ROADMAP.md`](docs/UNIFIED_ROADMAP.md). This guide documents what's true today; the roadmap documents where the codebase is heading.

## Table of contents
1. Development model
2. Local setup and validation
3. Platform architecture
4. Adding a new app
5. Adding a new feature
6. Adding a plugin
7. Building RetroScript "apps" and scripted experiences
8. Filesystem and persistence contracts
9. Event and command integration
10. Session lifecycle (logout / user-switch)
11. Admin/backend integration points
12. Documentation and cleanup standards

---

## 1) Development model

IlluminatOS has four extension layers:

1. **Apps** (`/apps`) — user-launched windows extending `AppBase`
2. **Features** (`/features` or plugin-provided) — background capabilities extending `FeatureBase`
3. **Plugins** (`/plugins/features/...`) — packages that register features/apps at runtime
4. **RetroScript content** (`.retro`) — automation and event-driven runtime content

All layers interconnect via:
- Semantic events (`EventBus`)
- Command execution (`CommandBus`)
- Shared filesystem (`FileSystemManager`)
- Shared state (`StateManager`)

---

## 2) Local setup and validation

### Run locally

Frontend-only:
```bash
python -m http.server 8000
```

With PHP backend v1 (file-based admin config):
```bash
php -S localhost:8000
```

With MySQL backend v2 (multi-user, real-time events, webhooks):
```bash
cp backend/env.example.php backend/env.php
# Edit backend/env.php with your MySQL credentials
php backend/migrate.php
php backend/seed.php        # optional: seed default admin
php -S localhost:8000
```

### Backend v2 test suite
```bash
php test-backend.php        # smoke tests for all API endpoints
```

### Recommended validation loop
1. Start server
2. Open app and check boot console logs
3. Test launch from Start menu and terminal
4. Verify no uncaught errors in browser console
5. Test persistence by reload
6. Check `window.__OS_BOOT_HEALTH` in console for per-component diagnostics

---

## 3) Platform architecture

### Boot sequence (authoritative flow)
Boot orchestration lives in `index.js`:
- Config loading (`ConfigLoader`)
- User session + real-time SSE init (v2 API only, via `RealtimeClient`)
- App registration (`AppRegistry`)
- Core service initialization (`StorageManager`, `StateManager`, `WindowManager`, `CommandBus`, `ScriptEngine`)
- Filesystem synchronization (desktop icons + installed apps)
- Feature registration (`FeatureRegistry`)
- Plugin loading + plugin feature registration (`PluginLoader`)
- Feature initialization (core + plugin features)
- UI renderer initialization
- Settings application
- Global handler setup
- Autoexec execution

Each phase is tracked by the boot health diagnostics system, recording status, duration, and errors per component.

### Key subsystems
- `apps/AppRegistry.js`: app registration + launch
- `core/WindowManager.js`: window lifecycle, modal stack with deterministic cleanup
- `core/FileSystemManager.js`: virtual filesystem (with server-backed file sync)
- `core/FeatureRegistry.js`: feature lifecycle, toggles, isolated-failure dependent disable
- `core/FeatureBase.js`: feature base class with serialized enable/disable queue
- `core/PluginLoader.js`: plugin manifest loading
- `core/script/ScriptEngine.js`: RetroScript runtime
- `core/script/utils/PathValidation.js`: single allowlist for script-driven file ops (also used by SSE remote FS handler in `index.js`)
- `core/CommandBus.js`: ⚠️ deprecated facade — delegates to `SemanticEventBus.commandHandlers`. Use `EventBus.registerCommand()` / `EventBus.executeCommand()` directly for new code.
- `core/SubscriptionManager.js`: owner-scoped subscription tracker. `runAs(ownerId, fn)` sets the active owner; `unsubscribeAll(ownerId)` releases.
- `core/EventTopology.js`: single source-of-truth list of cross-process events (`{ backend, frontend?, transports }`). Consumed by `RealtimeClient` and (later) `MultiplayerClient`.
- `core/ConfigLoader.js`: configuration loading with backend/default fallback; session token API
- `core/RealtimeClient.js`: SSE real-time event bridge (v2 API)
- `core/SemanticEventBus.js`: the canonical event bus — schema-validated semantic events with middleware, request/response, channels. `core/EventBus.js` is just a re-export.
- `core/SessionManager.js`: owns the logout / user-switch cascade. Single source of teardown sequence.
- `core/NarrativeStateManager.js`: campaign/scene/objective/flag/clue state with multiplayer sync
- `core/MultiplayerClient.js`: WebSocket client for real-time multiplayer; token via `Sec-WebSocket-Protocol`
- `core/PresenceManager.js`: online user tracking and status
- `core/GameSession.js`: multiplayer game lifecycle mixin
- `core/TelemetryCollector.js`: event capture and analytics
- `core/ReplayEngine.js`: deterministic replay from telemetry
- `core/MediaAssetManager.js` + `core/MediaCueGraph.js`: multimedia pipeline and cue orchestration
- `core/schema/index.js`: modular event schema (domain-specific schema files)

---

## 4) Adding a new app

### 4.1 Create the app class
Create `apps/MyApp.js`:

```js
import AppBase from './AppBase.js';

class MyApp extends AppBase {
  constructor() {
    super({
      id: 'myapp',
      name: 'My App',
      icon: 'fa-solid fa-star',
      width: 640,
      height: 420,
      resizable: true,
      singleton: false,
      category: 'accessories',
      showInMenu: true
    });
  }

  onOpen(params = {}) {
    this.setInstanceState('count', 0);
    return `<div class="myapp"><button id="inc">Increment</button><span id="out">0</span></div>`;
  }

  onMount() {
    this.addHandler(this.getElement('#inc'), 'click', () => {
      const next = this.getInstanceState('count', 0) + 1;
      this.setInstanceState('count', next);
      this.getElement('#out').textContent = String(next);
    });
  }
}

export default MyApp;
```

### 4.2 Register it
In `apps/AppRegistry.js`:
1. Import your app
2. Add `new MyApp()` in the right registration group

### 4.3 Add styling
- Create `styles/apps/myapp.css`
- Import it from `styles/main.css`

### 4.4 App quality checklist
- Uses `addHandler()` (not raw `addEventListener`) for cleanup safety
- Uses `setInstanceState()` / `getInstanceState()` for per-window state. **Do not** store window-scoped data on `this` directly — multi-instance apps will bleed state across windows. If you can't migrate today, mark the app `singleton: true` in the super() call.
- Handles keyboard shortcuts only when active window has focus
- Cleans timers/RAF loops in `onClose`
- Registers commands/queries in `onMount()` (not the constructor) so `_currentWindowId` is available for proper cleanup tracking
- Uses `this.escapeHtml()` (from `AppBase`) when inserting user-supplied text into `innerHTML`
- Guards against division by zero and null references in rendering/state calculations
- If your app subscribes to events that are scoped to the logged-in user (multiplayer rooms, presence, server-side state), subscribe inside `onMount` and unsubscribe on `onClose` — or hook `user:logout` / `user:switch` to drop session caches.

### 4.5 Multi-instance vs singleton

```js
super({
  id: 'myapp',
  // singleton: true makes launch() always focus the existing window.
  // Default (omitted / false) creates a new window per launch.
  singleton: false
});
```

Multi-instance apps **must** use per-window state APIs:

```js
// Inside onOpen / onMount / onClose:
this.setInstanceState('counter', 0);
const n = this.getInstanceState('counter', 0);
this.updateInstanceState({ counter: n + 1, lastClick: Date.now() });
```

State stored on `this` is shared across every window the app has open, which is virtually always a bug. `Terminal` is currently forced singleton for exactly this reason and is on the roadmap to migrate.

---

## 5) Adding a new feature

Features run in the background and are toggled through `FeatureRegistry`. Lifecycle is unified through `FeatureBase`.

### 5.1 Lifecycle contract (read this first)

`FeatureBase` provides three lifecycle hooks you may override:

| Hook | When | What to do |
|---|---|---|
| `initialize()` | Once, the first time the feature is enabled. **Never re-runs.** | Subscribe to events via `this.subscribe(...)`; bind DOM handlers via `this.addHandler(...)`; allocate any long-lived resources. |
| `enable()` | Every time the feature becomes active (boot, settings toggle on). Inherited; usually you do not override. | Activate the feature's behavior. The base class also calls `initialize()` the first time. |
| `disable()` | Every time the feature becomes inactive. Inherited; usually you do not override. | Release event/DOM resources via `cleanup()`. The base class queues your call so a rapid toggle can't double-run. |
| `cleanup()` | Called by `disable()`. | Override to free anything not tracked by `this.subscribe()` / `this.addHandler()`. The defaults already unwire subscriptions and DOM handlers. |

> ⚠️ `disable()` does **not** reset `this.initialized`. A subsequent `enable()` will not re-run `initialize()`. If your feature genuinely needs a re-init on toggle, override `disable()`:
>
> ```js
> async disable() {
>   await super.disable();
>   this.initialized = false; // force re-init next enable()
> }
> ```

Concurrent `enable()` / `disable()` calls are serialized internally — you never have to worry about two clicks racing.

### 5.2 Create feature class

```js
import FeatureBase from '../core/FeatureBase.js';

class MyFeature extends FeatureBase {
  constructor() {
    super({
      id: 'my-feature',
      name: 'My Feature',
      category: 'enhancement',
      config: { enabledThing: true, speed: 3 },
      dependencies: [], // other feature IDs this depends on
      settings: [
        { key: 'enabledThing', label: 'Enable Thing', type: 'checkbox' },
        { key: 'speed', label: 'Speed', type: 'number', min: 1, max: 10 }
      ]
    });
  }

  async initialize() {
    // Subscriptions registered through this.subscribe are auto-cleaned
    // in cleanup() — no need to track them yourself.
    this.subscribe('window:open', (payload) => this.log('window opened', payload));
  }
}

export default new MyFeature();
```

### 5.3 Register feature
- Core feature: register during feature phase in `index.js`
- Plugin feature: export from plugin manifest and let `PluginLoader` handle registration

### 5.4 Feature checklist
- Uses `this.subscribe()` and `this.addHandler()` helpers for automatic cleanup
- Keeps config defaults stable and consistent between `config.json` and code defaults
- Override `disable()` only if you need to force re-init on next enable (see §5.1)
- Guards against division by zero in progress/statistics calculations
- Resolves any pending callbacks/promises before replacing them (avoids hanging callers)
- If the feature depends on other features (e.g. `AchievementSystem` depends on `SoundSystem`), declare it in `dependencies` — `FeatureRegistry` walks dependents on disable and isolates per-feature failures.

---

## 6) Adding a plugin

### 6.1 Directory layout

```text
plugins/features/my-plugin/
├── index.js
└── MyFeature.js
```

### 6.2 Manifest shape

```js
import MyFeature from './MyFeature.js';

export default {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Example plugin',
  features: [new MyFeature()],
  apps: [],
  onLoad: async () => {},
  onUnload: async () => {}
};
```

### 6.3 Enable plugin
Preferred: add plugin path in config plugin list (`config/defaults.json`), then boot flow turns it into the runtime manifest.

### 6.4 Plugin safety checklist
- Unique `plugin id`
- Unique feature/app IDs
- No mutation of core globals outside lifecycle hooks
- Handles unload cleanly (removes listeners/timers/dom additions)

---

## 7) Building RetroScript “apps” and scripted experiences

You can ship fully interactive content as scripts, with optional helper windows/apps.

### 7.1 Delivery models
1. **Standalone script app**: a `.retro` file users run in Script Runner/Terminal
2. **Autoexec module**: startup script that bootstraps an experience
3. **Hybrid app + script**: JS app UI that calls ScriptEngine or exposes commands/events consumed by scripts

### 7.2 Script app best practices
- Namespace custom events (`myapp:*`)
- Store progression in filesystem (`C:/Users/User/...`) for visible state
- Use notifications/dialogs for user guidance
- Avoid hard-failing on missing files (`try/catch` blocks in RetroScript)

### 7.3 JS app ↔ script interoperability
In JS app code:
- Emit semantic events the script can subscribe to
- Register custom commands/queries for script control

In RetroScript:
- Use `on event:name {}` handlers
- Use `emit ...` and built-ins for app control/filesystem updates

---

## 8) Filesystem and persistence contracts

### Filesystem
Use `FileSystemManager` API for all file operations; avoid directly touching raw state.

### Persistence
- `StorageManager`: localStorage abstraction
- `StateManager`: state tree with optional persistence flags
- Use existing storage key conventions (prefixed by `illuminatos_`)

### Sync behavior
During boot, desktop icons and installed apps are synced into filesystem structures for cross-app consistency.

---

## 9) Event and command integration

### Events
- Subscribe via `EventBus`/`FeatureBase.subscribe`/`AppBase.onEvent`
- Prefer semantic event names (`namespace:action`)
- Keep payloads structured and explicit
- Raw `EventBus.on(...)` calls inside `onOpen`/`onMount`/`initialize()`/plugin `onLoad()` are auto-tracked by `SubscriptionManager` against the current owner (windowId/featureId/pluginId) and released on close/disable/unload. You still get the `this.subscribe(...)` / `this.onEvent(...)` helpers for the common case — `SubscriptionManager` is the safety net.

### Commands
The command registry lives on `SemanticEventBus`. Preferred call style:

```js
import EventBus from '../core/EventBus.js';

EventBus.registerCommand('myapp:doThing', async (payload) => {
  return { ok: true };
});

await EventBus.executeCommand('myapp:doThing', { foo: 1 });
```

`CommandBus.register()` / `CommandBus.execute()` still work — they're a thin facade that delegates to the unified API — but `CommandBus.js` is `@deprecated`. The script engine no longer takes `CommandBus` in its context (every visitor and builtin now goes through `context.EventBus.executeCommand`), and `apps/ScriptRunner.js` no longer imports the file. Boot still calls `CommandBus.initialize()` because that's where the `command:fs:*` / `command:window:*` / `command:terminal:*` handler set is registered — full file removal is tracked as P2.1 in `docs/MIGRATION_ROADMAP.md`. Use the bus directly for new code.

Common command surfaces: app lifecycle actions, window actions, filesystem actions, dialog/notification/sound/system settings actions. If you add app-specific script control, register commands from the app and document them.

### Authenticated HTTP

For any v2 API call, use `fetchWithAuth` from `ConfigLoader`:

```js
import { fetchWithAuth } from '../core/ConfigLoader.js';

const resp = await fetchWithAuth('/api/v2/foo', { method: 'POST', body: JSON.stringify(...) });
```

It adds `Authorization: Bearer <token>` and `X-Requested-With: XMLHttpRequest` automatically, and on 401 triggers `SessionManager.logout({ reason: 'auth_expired' })` plus emits `auth:expired`. Pass `skipAuth: true` for endpoints that intentionally don't carry a session.

### Cross-process events (SSE / WS)

Adding a new server-emitted event? Add one entry to `core/EventTopology.js`:

```js
{ backend: 'my.feature.event', frontend: 'myfeature:event', transports: ['sse'], description: '…' }
```

`RealtimeClient` derives its bridge allowlist from this list. When `frontend` is set, both `sse:<backend>` (legacy alias) and the semantic frontend name are emitted, so new subscribers can use the clean name while existing handlers in `index.js` keep working.

---

## 10) Session lifecycle (logout / user-switch)

The user-session lifecycle is unified through `core/SessionManager.js`. Don't tear down realtime/presence/state from a UI handler — go through `SessionManager`.

### 10.1 Canonical events

| Event | When | What's already done by the time it fires |
|---|---|---|
| `user:login` | Initial boot login completed or post-logoff login completed | Token set, storage rescoped, `StateManager.initialize()` finished |
| `user:logout` | User logged off | Realtime closed, presence destroyed, multiplayer disconnected, token cleared, `StateManager.resetVolatile()` ran |
| `user:switch` | Active user changed | Same teardown as logout, then storage rescoped to the new user |
| `auth:expired` | `fetchWithAuth` saw a 401 | Logout cascade has already run (token cleared, realtime/presence torn down). Show a reauth UI. |

### 10.2 Hooks for your feature/app

```js
// In a feature's initialize():
this.subscribe('user:login', ({ username, mode }) => {
  // Fetch the new user's data from the server
});

this.subscribe('user:logout', () => {
  // Drop any user-scoped in-memory cache
});

this.subscribe('user:switch', ({ previous, next }) => {
  // Equivalent to logout+login for caching purposes
});
```

### 10.3 Triggering logout / user-switch

```js
import SessionManager from '../core/SessionManager.js';

// End the session (e.g. Start → Log Off)
await SessionManager.logout({ reason: 'user_requested' });

// Switch directly to another user (no logout overlay)
await SessionManager.switchUser('alice');
```

The cascade is sequenced so subscribers never see a half-torn-down session:

1. `MultiplayerClient.disconnect()` — stop receiving WS events for the outgoing user
2. `closeRealtime()` — close the SSE stream
3. `PresenceManager.destroy()` — drop presence + typing state
4. `setSessionToken(null)` — fail any in-flight fetches fast
5. `StateManager.resetVolatile()` — clear in-memory user-scoped state (icons, windows, UI flags)
6. emit `user:logout` or `user:switch` for subscribers

Storage is untouched on `logout()` (it's user-scoped already) and rescoped on `switchUser(newUser)`.

---

## 11) Admin/backend integration points

### Backend v1 (file-based, no database required)
- `api/config.php`: merged runtime config
- `api/auth.php`: admin auth
- `api/save.php`: admin config writes
- `api/queue.php`: server-authoritative queue for remote turn-based control
- `admin/`: admin UI

### Backend v2 (MySQL-backed, multi-user)
When a MySQL database is configured (`backend/env.php`), the v2 API provides:

- **REST API** (`api/v2/index.php`): router + middleware (auth, CORS, rate limiting)
- **Controllers** (15): Auth, Config, User, System, Theme, Event, Webhook, Audit, File, Game, Multiplayer, Presence, Social, Message, UserState
- **Models** (16): User, Session, Config, Theme, Event, Webhook, AuditLog, UserFile, UserStateSnapshot, Room, GameSession, GamePlayer, Leaderboard, Friendship, ChatMessage, DirectMessage
- **Services** (4): EventService (event lifecycle), SSEBroadcaster (real-time push), WebhookDispatcher (external integrations), FileStorageService (server-side file storage)
- **Migrations**: 19 SQL migrations (`backend/migrations/`) — run via `php backend/migrate.php`
- **Seeding**: `php backend/seed.php` for default admin user
- **Admin panel components** (`admin/assets/components/`): Dashboard, UserManager, ThemeCreator, WebhookManager, AuditLogViewer, AnnouncementManager
- **Real-time client** (`core/RealtimeClient.js`): SSE connection with auto-reconnect, bridging server events into the frontend EventBus
- **WebSocket sidecar** (`websocket/`): PHP WebSocket server for multiplayer transport, authenticating against the PHP API
- **Setup wizard** (`setup.php`): first-run health check, PHP version/extension validation, credential setup. Locked after first run with no bypass.

### Frontend fallback
When backend is unavailable, the frontend continues with inline defaults and logs warnings. All backend features degrade gracefully.

---

## 12) Documentation and cleanup standards

When you add/modify capabilities:
1. Update README overview if user-facing behavior changed
2. Update this guide for extension workflow changes
3. Update `SCRIPTING_GUIDE.md` for script-visible changes
4. Update `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` for event/command/query changes
5. Update `docs/UNIFIED_ROADMAP.md` if you completed (or reshaped) a roadmap item
6. Remove superseded planning/debug docs rather than leaving stale guidance

Use this rule: if a document is no longer actionable for contributors, archive it outside repo or delete it.

### Backend v2 documentation
When modifying backend v2:
- Update `backend/env.example.php` if new config keys are added
- Add new SQL migrations in `backend/migrations/` (numbered sequentially, currently 001-019)
- Update `test-backend.php` with smoke tests for new endpoints

### Security considerations
- Never use `innerHTML` with unsanitized user input — use `textContent` or `escapeHtml()`
- Backend color validation must accept only 3-digit or 6-digit hex (not arbitrary lengths)
- Rate limiting keys should use parsed URL paths (not raw URI with query strings)
- Route registration order matters: specific routes (e.g., `/config/user/:section`) must come before wildcard routes (e.g., `/config/:section`)
- **Path allowlist** for script-driven and SSE-driven file operations lives in `core/script/utils/PathValidation.js`. Both call sites use it. Adding a new safe root requires only one edit. Do not duplicate the prefix list inline.
- **WebSocket auth**: pass the session token via `Sec-WebSocket-Protocol: token.<hex>` only. The legacy `?token=` query string is accepted server-side for compatibility but must not be used by new client code (tokens in URLs leak into proxy logs and browser history).
- Multiplayer remote state handlers must set `_isProcessingRemoteUpdate = true` before emitting local events to prevent infinite broadcast loops
- The `SemanticEventBus.request()` method uses a `settled` flag to prevent double-resolution races between timeout and response handlers
- Validate `appId` against `AppRegistry.getAll()` before launching apps from SSE events
- When adding debug properties to `window.__RETROS_DEBUG`, use `Object.assign` to merge — never overwrite the entire object

