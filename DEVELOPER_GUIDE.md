# IlluminatOS! Developer Guide

This guide documents the **current** development workflow for extending IlluminatOS with apps, features, plugins, and RetroScript-driven experiences.

## Table of contents
1. Development model
2. Local setup and validation
3. Platform architecture
4. Adding a new app
5. Adding a new feature
6. Adding a plugin
7. Building RetroScript “apps” and scripted experiences
8. Filesystem and persistence contracts
9. Event and command integration
10. Admin/backend integration points
11. Documentation and cleanup standards

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
- `core/WindowManager.js`: window lifecycle
- `core/FileSystemManager.js`: virtual filesystem (with server-backed file sync)
- `core/FeatureRegistry.js`: feature lifecycle and toggles
- `core/PluginLoader.js`: plugin manifest loading
- `core/script/ScriptEngine.js`: RetroScript runtime
- `core/CommandBus.js`: script/system command adapters
- `core/ConfigLoader.js`: configuration loading with backend/default fallback
- `core/RealtimeClient.js`: SSE real-time event bridge (v2 API)
- `core/SemanticEventBus.js`: higher-level typed semantic events with middleware, request/response, channels
- `core/NarrativeStateManager.js`: campaign/scene/objective/flag/clue state with multiplayer sync
- `core/MultiplayerClient.js`: WebSocket client for real-time multiplayer
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
- Uses `instance state` for per-window state
- Handles keyboard shortcuts only when active window has focus
- Cleans timers/RAF loops in `onClose`
- Registers commands/queries in `onMount()` (not the constructor) so `_currentWindowId` is available for proper cleanup tracking
- Uses `this.escapeHtml()` (from `AppBase`) when inserting user-supplied text into `innerHTML`
- Guards against division by zero and null references in rendering/state calculations

---

## 5) Adding a new feature

Features run in background and are toggled through `FeatureRegistry`.

### 5.1 Create feature class

```js
import FeatureBase from '../core/FeatureBase.js';

class MyFeature extends FeatureBase {
  constructor() {
    super({
      id: 'my-feature',
      name: 'My Feature',
      category: 'enhancement',
      config: { enabledThing: true, speed: 3 },
      settings: [
        { key: 'enabledThing', label: 'Enable Thing', type: 'checkbox' },
        { key: 'speed', label: 'Speed', type: 'number', min: 1, max: 10 }
      ]
    });
  }

  async initialize() {
    this.subscribe('window:open', (payload) => this.log('window opened', payload));
  }
}

export default new MyFeature();
```

### 5.2 Register feature
- Core feature: register during feature phase in `index.js`
- Plugin feature: export from plugin manifest and let `PluginLoader` handle registration

### 5.3 Feature checklist
- Uses `subscribe()` and `addHandler()` helpers for automatic cleanup
- Keeps config defaults stable and consistent between `config.json` and code defaults
- Has explicit `enable/disable` behavior if runtime toggling changes stateful behavior
- Guards against division by zero in progress/statistics calculations
- Resolves any pending callbacks/promises before replacing them (avoids hanging callers)

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

### Commands
Use `CommandBus` for scriptable cross-system actions:
- app lifecycle actions
- window actions
- filesystem actions
- dialog/notification/sound/system settings actions

If you add app-specific script control, register commands from the app and document them.

---

## 10) Admin/backend integration points

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

## 11) Documentation and cleanup standards

When you add/modify capabilities:
1. Update README overview if user-facing behavior changed
2. Update this guide for extension workflow changes
3. Update `SCRIPTING_GUIDE.md` for script-visible changes
4. Update `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` for event/command/query changes
5. Remove superseded planning/debug docs rather than leaving stale guidance

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
- SSE filesystem commands are restricted to allowed path prefixes (`/C/server/`, `/C/shared/`, `/C/public/`). Do not add new prefixes without reviewing blast radius.
- Multiplayer remote state handlers must set `_isProcessingRemoteUpdate = true` before emitting local events to prevent infinite broadcast loops
- The `SemanticEventBus.request()` method uses a `settled` flag to prevent double-resolution races between timeout and response handlers
- Validate `appId` against `AppRegistry.getAll()` before launching apps from SSE events
- When adding debug properties to `window.__RETROS_DEBUG`, use `Object.assign` to merge — never overwrite the entire object

