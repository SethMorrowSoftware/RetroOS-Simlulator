# IlluminatOS! Unified Roadmap

**Owner:** core platform
**Start:** PR #1 landed Wave 1 (lifecycle + cleanup) and partial Wave 3 (script path validation, WS subprotocol auth).
**End goal:** A single, unified, rock-solid platform API. No parallel buses, no duplicated allowlists, no legacy event names, no per-window state on `this`. Every cross-cutting concern (subscriptions, session lifecycle, realtime routing, auth, file-op validation) has exactly one owner.

This roadmap supersedes the open items in `docs/ARCHITECTURE_AUDIT.md`. The audit remains the historical record; this document is the active plan.

---

## Table of contents

1. [End-state vision](#end-state-vision)
2. [Status snapshot](#status-snapshot)
3. [Wave 1 — Foundation (done)](#wave-1--foundation-done)
4. [Wave 2 — Source-of-truth consolidation](#wave-2--source-of-truth-consolidation)
5. [Wave 3 — Hardening & drift cleanup](#wave-3--hardening--drift-cleanup)
6. [Wave 4 — Legacy retirement](#wave-4--legacy-retirement)
7. [Per-item detail](#per-item-detail)
8. [Success criteria](#success-criteria)
9. [Operating rules during the migration](#operating-rules-during-the-migration)

---

## End-state vision

When the roadmap is complete, the unified platform has these single owners:

| Concern | Single owner | Notes |
|---|---|---|
| Events (validation, pub/sub, request/response, channels, middleware, command execution) | `SemanticEventBus` | `CommandBus.js` retired into a thin facade, then deleted. |
| Subscription ownership (auto-unsubscribe on app close / feature disable / plugin unload / logout) | `SubscriptionManager` | Wraps every `.on()` in the system. `AppBase`/`FeatureBase` use it automatically. |
| User session lifecycle (login, logout, switch, expired) | `SessionManager` | All teardown sequenced; subscribers listen for `user:*` events. ✅ exists. |
| Realtime event mapping (SSE ↔ WS ↔ internal event names) | `EventTopology` | Single registry; no per-handler bridge files. |
| Auth-aware HTTP requests | `fetchWithAuth` | All `fetch()` callers migrated. 401 → clear token → emit `auth:expired` → reauth UI. |
| Script-driven and SSE-driven file-op path validation | `core/script/utils/PathValidation.js` | ✅ exists, both call sites use it. |
| In-memory user-scoped state | `StateManager.resetVolatile()` | ✅ exists, called from `SessionManager`. |
| Window-scoped state | `setInstanceState()` / `getInstanceState()` on `AppBase` | Every multi-window app uses these; no per-window state on `this`. |
| Feature lifecycle | `FeatureBase` with internal lifecycle queue | ✅ exists. `initialize()` runs once; concurrent toggles serialized. |
| Plugin loading | `PluginLoader` with transactional load | Failed `onLoad()` or feature init rolls back; manifest validated up front. |
| Desktop icons | Virtual filesystem (`Desktop/*.lnk`) | `StateManager.icons` becomes a view derived from the FS, not an independent store. |

The final API surface lives in `CLAUDE.md` § Architecture Patterns and is reflected in `DEVELOPER_GUIDE.md`.

---

## Status snapshot

| Wave | Theme | Status |
|---|---|---|
| Wave 1 | Foundation: lifecycle, session, modal race, partial path/auth hardening | ✅ Landed in PR #1 |
| Wave 2 | Source-of-truth consolidation: `SubscriptionManager`, `EventTopology`, `CommandBus` facade, `fetchWithAuth` | ✅ Landed in PR #2 |
| Wave 3 | Hardening: storage hydration guard, prototype-pollution guards, atomic state+storage write, FS sync emit, icon coord clamp, CommandBus fs path validation, plugin manifest validation + transactional load, script context validation, builtin error uniformity | ✅ Landed in PR #2 |
| Wave 4 | Legacy retirement: drop `LEGACY_EVENT_MAPPING`, remove `CommandBus` facade, remove WS query-string auth, Terminal per-window state migration, remove `core/EventBus.js` re-export, desktop-icon reconciliation (FS-as-truth) | ⏳ Planned |

Total time estimate from PR #1 to "final unified product": Wave 4 (3 PRs).

> Wave 3 landed in two halves: this PR (#2) bundled it with Wave 2 because the items overlapped — `fetchWithAuth` shares the hardening surface, and the plugin/script/storage guards are small enough that a separate PR would have been mostly diff noise. W3.2 (desktop-icon reconciliation) is deferred to Wave 4 because it touches boot order and warrants its own focused PR.

---

## Wave 1 — Foundation (done)

Landed in PR #1. See `docs/ARCHITECTURE_AUDIT.md` for status annotations.

- ✅ `SessionManager` owns logout / user-switch cascade.
- ✅ `StateManager.resetVolatile()` clears in-memory user-scoped state.
- ✅ `FeatureBase.disable()` no longer resets `initialized`; lifecycle queue serializes enable/disable.
- ✅ `FeatureRegistry` dependent-disable isolates per-feature failures.
- ✅ `WindowManager._modalCleanups` map; modal cleanup synchronous on close.
- ✅ Script file-op visitors call `validateScriptPath()`; allowlist shared with SSE handler.
- ✅ WebSocket auth via `Sec-WebSocket-Protocol: token.<hex>`.
- ✅ Terminal forced `singleton: true` as the interim fix for the multi-instance violation.
- ✅ `user:login` / `user:logout` / `user:switch` / `auth:expired` events with schema.

---

## Wave 2 — Source-of-truth consolidation (done)

Landed in PR #2. Once Wave 2 lands, "where is this owned?" has a single answer for every cross-cutting concern.

### W2.1 — `SubscriptionManager` ✅

**Problem.** Subscribers accumulate. `EventBus.on(...)` returns an unsubscribe function that virtually nobody stores. Apps closing, features disabling, plugins unloading, and the logout cascade all leak.

**Resolution.** `core/SubscriptionManager.js` (new). Wraps every `SemanticEventBus.on` and `StateManager.subscribe` return automatically: when one of these is called inside a `SubscriptionManager.runAs(ownerId, fn)` scope, the unsubscribe function is recorded against that owner. A single `unsubscribeAll(ownerId)` call releases the lot.

Owner IDs:
- App window ID (`notepad-1`, `notepad-2`, …) — owned by the open window.
- App ID (`notepad`) — for constructor-time registrations that survive a single window's lifetime.
- Feature ID (`soundsystem`) — for raw subscriptions inside `initialize()` that bypass `this.subscribe()`.
- Plugin ID — for raw subscriptions inside `onLoad()` that bypass feature lifecycle.
- `'session'` — reserved for future migrations of boot-time wiring that should drop on logout.

Integration:
- `AppBase.launch()` wraps `onOpen` and `onMount` in `SubscriptionManager.runAs(windowId, …)`.
- `AppBase.handleClose()` calls `SubscriptionManager.unsubscribeAll(windowId)` and, when the last window closes, `unsubscribeAll(this.id)`.
- `FeatureBase.enable()` wraps `initialize()` in `runAs(this.id, …)`. `cleanup()` calls `unsubscribeAll(this.id)`.
- `PluginLoader.loadPlugin()` wraps `onLoad()` in `runAs(plugin.id, …)`. `unloadPlugin()` calls `unsubscribeAll(pluginId)`.
- `SessionManager._teardown` calls `unsubscribeAll('session')`.

Compatibility: anonymous subscriptions (no owner active) pass through unchanged — existing `EventBus.on(...)` calls outside any lifecycle keep the old "caller manages cleanup" semantics. AppBase's `onEvent()` and FeatureBase's `subscribe()` helpers remain in place and continue tracking unsubscribes in their per-owner arrays; SubscriptionManager is an additional safety net for raw `.on()` calls inside lifecycle code.

### W2.2 — `EventTopology` ✅

**Problem.** Realtime event mapping is sprawled across three files: `RealtimeClient.bridgedEvents`, `index.js:694-799` SSE handlers, and the `MultiplayerClient` WS bridge. Drift is already present (`narrative.mood.shift` / `system.notification` wired in `index.js` but not `bridgedEvents`).

**Resolution.** `core/EventTopology.js` (new). Single array of `{ backend, frontend?, transports, description? }` entries covering every cross-process event. `RealtimeClient.bridgedEvents` is now derived from `getBackendEventsForTransport('sse')` — adding a new SSE event means adding one topology entry, no second list to keep in sync.

When `frontend` is set on a topology entry, `RealtimeClient` emits *both* the legacy `sse:<backend>` alias (existing handlers in `index.js` keep working) *and* the semantic `frontend` name (new handlers can subscribe directly). When `frontend` is omitted (because the existing handler in `index.js` does payload transformation that the topology can't do), only the legacy alias fires.

Wave 4 will retire the `sse:<backend>` aliases once all handlers have moved to the semantic names defined in the topology.

### W2.3 — `CommandBus` facade ✅

**Problem.** Two parallel registration mechanisms (`EventBus.on('command:*')` and `CommandBus.register`). Developers must choose. The bus already routes commands as events.

**Resolution.** `SemanticEventBus` now owns the command registry (`commandHandlers` Map, `registerCommand()`, `executeCommand()`, `hasCommand()`, `getCommands()`). `CommandBus.js` is a thin facade: its `handlers` field is a *reference* to `SemanticEventBus.commandHandlers`, and `CommandBus.register()` / `.execute()` delegate to the unified API. The file is marked `@deprecated` and will be removed in Wave 4. No call-site changes required for existing code.

New code should `import EventBus from './EventBus.js'` and call `EventBus.registerCommand(...)` / `EventBus.executeCommand(...)` directly.

### W2.4 — `fetchWithAuth` + 401 trap ✅

**Problem.** Backend expires tokens; frontend never notices and loops with a stale token. No reauth UI.

**Resolution.** `fetchWithAuth(input, init)` exported from `ConfigLoader.js`:
- Adds `Authorization: Bearer <token>` (unless `skipAuth: true` is passed in `init`).
- Adds `X-Requested-With: XMLHttpRequest` as the CSRF sentinel.
- On a 401 response, invokes `SessionManager.logout({ reason: 'auth_expired' })` and emits `auth:expired` (schema already exists). A re-entrancy guard prevents recursive logouts when multiple in-flight requests resolve to 401 simultaneously.

Migrated callers in this PR: `UserStateSync` (3 fetches), `FileSystemManager` (6 fetches), `RealtimeClient` (the SSE stream connection). `LoginScreen`'s login/register fetches intentionally stay on raw `fetch()` — a 401 there means "wrong password" or "anonymous session expired", not "active session token died", and we don't want those to trigger the logout cascade.

The reauth UI (a modal that prompts for credentials when `auth:expired` fires) is not yet wired — emitting the event from the trap is enough to break the reconnect loop, and a feature can subscribe to render the UI in a follow-up PR.

---

## Wave 3 — Hardening & drift cleanup (done, except W3.2)

Landed in PR #2 alongside Wave 2. The one exception is W3.2 (desktop-icon reconciliation), which touches boot order and warrants its own PR — moved to Wave 4.

### W3.1 — Storage hydration guard ✅

`StorageManager.beginHydration()` / `endHydration()` / `isHydrating()` plus a `hydrationSet(key, value)` backdoor for the hydrator itself. `StorageManager.set()` drops writes (with a `telemetry.hydrationDrops` increment + warning) during a hydration window. `UserStateSync.pullRemoteSnapshot` now brackets its restore loop in `beginHydration` / `endHydration` and uses `hydrationSet` for the snapshot writes themselves. The existing `isApplyingRemoteSnapshot` flag stays in place (it's read by `scheduleSync` to avoid pushing back during a pull) — the new flag closes the complementary hole.

### W3.2 — Desktop-icon reconciliation ⏳ Wave 4

`StateManager.icons` and `Desktop/*.lnk` are still two sources of truth. Picking FS as the truth touches boot order (`StateManager.initialize` would hydrate icons from `FileSystemManager.getDesktopShortcuts()` instead of `StorageManager.get('desktopIcons')`) and changes runtime sync direction — deferred to a separate PR.

### W3.3 — FS-sync event emission ✅

`syncDesktopIcons` and `syncInstalledApps` now emit `filesystem:directory:changed` and a `filesystem:changed { source }` event when they're done mutating the tree. Apps subscribed to FS changes (Explorer-style views, file pickers) no longer miss the sync's writes.

### W3.4 — `StateManager.setStateAndPersist` ✅

`StateManager.setStateAndPersist(path, value)` writes storage first (via `StorageManager.set`, which now returns `false` on quota / hydration drop / prototype-pollution rejection) and only commits the in-memory state on success. Subscribers see the change exactly when both stores agree.

### W3.5 — Storage payload guards ✅

`StorageManager.set` / `get` / `setGlobal` / `getGlobal` / `hydrationSet` now run an `_hasUnsafeKeys()` recursive scan that rejects payloads containing `__proto__`, `constructor`, or `prototype` keys at any depth. Rejections are tallied in `telemetry.unsafeKeyRejections` so admins can spot exploit attempts in the boot health report.

### W3.6 — Icon coordinate bounds ✅

`StateManager._clampCoord(value)` snaps non-finite numbers to 0 and clamps anything outside [0, 100000] into the viewport. Called by `addIcon`, `updateIconPosition`, and `restoreIcon`. Stops a NaN drag handler from stranding an icon off-screen and corrupting `desktopIcons` storage.

### W3.7 — Plugin manifest validation & transactional load ✅

`PluginLoader._validatePluginManifest()` runs before any registration: rejects missing/empty `id`, non-array `features`/`apps`, duplicate feature/app IDs within the plugin, declared `feature.dependencies` that don't resolve in the current registry, non-function `onLoad`/`onUnload`. `loaded: true` is now set *after* `onLoad` and all feature/app registrations succeed — a partially-loaded plugin no longer reports as healthy. On failure, the loader rolls back only the registrations it tracked during this load (precise, not "everything tagged with this pluginId") and runs `onUnload` symmetrically so plugins can clean up non-subscription resources.

### W3.8 — Builtin error type uniformity ✅

Replaced bare `throw new Error(...)` in `TelemetryBuiltins` (6 sites) and `DebugBuiltins` (3 sites) with `throw new RuntimeError(...)`. `RuntimeError` carries the line/column/hint structure the interpreter pipeline expects, so scripts now get consistent error envelopes regardless of which builtin failed.

### W3.9 — ScriptEngine context contract ✅

`ScriptEngine.validateContext(context)` returns `{ ok, missingRequired, missingOptional }`. Required: `FileSystemManager`, `EventBus`. Optional: `StateManager`, `WindowManager`, `StorageManager`, `AppRegistry`, `FeatureRegistry`, `TelemetryCollector`, `ReplayEngine`, `NarrativeStateManager`, `MediaAssetManager`. `ScriptEngine.initialize()` calls this and logs an error when required services are missing — engine still initializes (cosmetic builtins keep working) but the boot-health diagnosis is now obvious.

### W3.10 — CommandBus fs commands path validation ✅

`command:fs:read|write|delete|mkdir|copy|move` now run their payload through `validateScriptPath()` (the same allowlist the script engine and SSE handler use) before reaching `FileSystemManager`. `copy` / `move` validate *both* endpoints so an attacker can't smuggle a write by validating one path and operating on another. Closes the escape hatch where a script could bypass the engine-level check by emitting `command:fs:write` directly.

---

## Wave 4 — Legacy retirement

The final pass. Everything below assumes Wave 2 and Wave 3 are landed.

### W4.1 — Drop `LEGACY_EVENT_MAPPING`

Migrate all call-sites to semantic names (`ui:menu:start:toggle`, `system:ready`, `feature:pet:toggle`, etc.). Remove the mapping table from `SemanticEventBus.js`. Grep is now reliable.

### W4.2 — Remove `core/CommandBus.js` facade

Once all callers have switched to `SemanticEventBus.registerCommand` / `executeCommand`, delete `CommandBus.js`. The transition is mechanical given W2.3.

### W4.3 — Remove WebSocket legacy auth paths

Drop `?token=` query and `Authorization: Bearer` from `websocket/server.php` and `WebSocketFrame.php` `parseQueryParams`/`parseAuthHeader`. Subprotocol auth becomes the only supported method. Coordinate with any external clients (the React Native app, integrations, etc.).

### W4.4 — Terminal per-window state migration

Move `commandHistory`, `historyIndex`, `currentPath`, `aliases`, `envVars`, `activeProcess`, `batchCommands`, `_mpSession`, `_mpUnsubscribers`, `lastOutput`, `godMode`, `pipeEnabled` off `this` and onto `setInstanceState()`. Drop `singleton: true`. Update `TERMINAL_SCRIPTING.md`. 161 reference sites — invest in a codemod or do it carefully by file region.

### W4.5 — Remove `core/EventBus.js` re-export

Once enough time has passed and existing imports have switched directly to `SemanticEventBus`, drop the re-export shim.

### W4.6 — Final audit pass

Re-run the full architecture audit (in agent form, per the original methodology) against the cleaned-up codebase. The expected output: zero cross-cutting findings.

---

## Per-item detail

### W2.1 SubscriptionManager — design sketch

```js
// core/SubscriptionManager.js
class SubscriptionManagerClass {
    constructor() {
        this._byOwner = new Map(); // ownerId -> Set<unsubFn>
        this._currentOwner = null;
    }
    runAs(ownerId, fn) {
        const prev = this._currentOwner;
        this._currentOwner = ownerId;
        try { return fn(); }
        finally { this._currentOwner = prev; }
    }
    track(unsub) {
        if (!this._currentOwner) return unsub; // anonymous; caller manages
        const set = this._byOwner.get(this._currentOwner) ?? new Set();
        set.add(unsub);
        this._byOwner.set(this._currentOwner, set);
        return () => { unsub(); set.delete(unsub); };
    }
    unsubscribeAll(ownerId) {
        const set = this._byOwner.get(ownerId);
        if (!set) return 0;
        for (const u of set) { try { u(); } catch (e) { console.error(e); } }
        this._byOwner.delete(ownerId);
        return set.size;
    }
}
```

`SemanticEventBus.on` becomes:

```js
on(eventName, callback, opts) {
    const unsub = this._registerListener(eventName, callback, opts);
    return SubscriptionManager.track(unsub);
}
```

Each lifecycle entry point wraps its body in `SubscriptionManager.runAs(ownerId, () => ...)`. `AppBase.launch`, `FeatureBase.enable`, `PluginLoader.loadPlugin` all already have a natural ownerId.

### W2.2 EventTopology — file layout

```js
// core/EventTopology.js
export const EventTopology = [
    { backend: 'system.notification', frontend: 'notification:show', transports: ['sse', 'ws'] },
    { backend: 'narrative.mood.shift', frontend: 'narrative:mood:shift', transports: ['sse'] },
    { backend: 'game.session.update', frontend: 'game:session:update', transports: ['ws'] },
    // ...
];
```

`RealtimeClient`, the SSE handlers in `index.js`, and `MultiplayerClient` each ask the topology "for transport X, what frontend event do I emit when I receive backend event Y?" Drift becomes impossible because there is no second list.

### W2.4 fetchWithAuth — API

```js
// In ConfigLoader.js
export async function fetchWithAuth(input, init = {}) {
    const token = getSessionToken();
    const headers = new Headers(init.headers ?? {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Requested-With', 'IlluminatOS');
    const resp = await fetch(input, { ...init, headers });
    if (resp.status === 401) {
        await SessionManager.logout({ reason: 'auth_expired' });
        EventBus.emit(Events.AUTH_EXPIRED, { endpoint: String(input) });
        // The reauth dialog opens via a SystemDialogs subscriber.
    }
    return resp;
}
```

Migration: grep `\bfetch\(` across the frontend and replace with `fetchWithAuth` everywhere that talks to `/api/...`.

---

## Success criteria

The platform is "unified" when **all** of the following are true:

1. **No parallel buses.** `CommandBus.js` is deleted (or a one-line re-export of `SemanticEventBus.registerCommand`).
2. **No leaked subscribers.** Closing all 44 apps and disabling every feature returns `SubscriptionManager._byOwner.size === 0`.
3. **Single allowlist for file-op paths.** Grep for `'C:/Users/User/'` returns only `core/script/utils/PathValidation.js` and tests.
4. **Single realtime topology.** Grep for `EventBus.on('sse:` returns only the central handler in `index.js` that walks `EventTopology`.
5. **No tokens in URLs.** Grep for `?token=` across the JS returns 0 results.
6. **No per-window state on `this`** in any app. Each app either declares `singleton: true` or uses `setInstanceState()` exclusively for window-scoped data. Terminal has been migrated.
7. **Boot-to-logout-to-boot is clean.** Run the manual smoke: boot as user A, open 5 apps, log off, log in as user B. `window.__OS_BOOT_HEALTH` shows no degraded components; no warnings about double subscriptions; user A's icons / windows / settings are not visible.
8. **Auth expiry is graceful.** Stop the backend mid-session; the frontend should observe one 401, emit `auth:expired`, show the reauth dialog, and stop the loop.
9. **The audit's open items list is empty.** Every row in `docs/ARCHITECTURE_AUDIT.md`'s Cross-Cutting Themes shows ✅ or N/A.
10. **`LEGACY_EVENT_MAPPING` is gone.** Grep for the constant returns 0 results.

---

## Operating rules during the migration

These rules apply to every PR between PR #1 and the final cleanup pass.

- **New code uses the unified API.** Don't add a new `EventBus.on('sse:foo', ...)` handler — add the entry to `EventTopology` (or wait for W2.2 to land and then add it). Don't store new state on `this` in a multi-instance app — use `setInstanceState`.
- **Touch what you're working on.** When you modify a file that still uses a legacy pattern (raw `EventBus.on` in an app, `this.foo` for window state, an inline path allowlist), migrate that piece in the same PR. Avoid bulk migrations; they balloon scope.
- **Schema first.** When adding a new event, add the schema entry in `core/schema/*.js` and use the new name. Don't introduce a new entry to `LEGACY_EVENT_MAPPING`.
- **No backwards-compat shims for new APIs.** `SubscriptionManager` is new; it doesn't need a legacy fallback. `fetchWithAuth` is new; just call it.
- **Document the change.** Every roadmap item PR updates:
  - `docs/UNIFIED_ROADMAP.md` (move the item from ⏳ to ✅).
  - `CLAUDE.md` § Architecture Patterns (if the API surface changed).
  - `DEVELOPER_GUIDE.md` (if how-to-extend changed).
  - `docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md` (if the script-visible event set changed).
- **Tests stay green.** `bash scripts/lint-innerhtml.sh`, `node scripts/test-retroscript.mjs`, `php test-backend.php`, and the manual smoke must all pass before merge.

---

## Out of scope

This roadmap deliberately does **not** address:

- **CSS / styling unification.** 53 CSS files with import-order requirements is a fragility surface, but it's orthogonal to the architectural unification. Treat as a separate audit.
- **Backend architecture deep-dive.** The PHP backend (`backend/controllers`, `backend/models`, `backend/services`) was spot-checked only in the original audit. A separate PHP audit may be warranted but is not part of this plan.
- **Build/deploy pipeline.** The zero-build approach is a feature. Service worker / cache invalidation strategy is out of scope here.
- **Per-app refactors beyond Terminal.** Each app likely has its own quirks that surface once the platform contracts are enforced. Each is its own PR, not part of this roadmap.
- **Performance work.** No profiling was done. Recommendations here are structural, not perf-driven.

When any of the above becomes important enough to address, spin up a sibling roadmap rather than expanding this one.
