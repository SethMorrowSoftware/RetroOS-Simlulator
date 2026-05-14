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
| Wave 2 | Source-of-truth consolidation: `SubscriptionManager`, `EventTopology`, `CommandBus` facade, `fetchWithAuth` | ⏳ Planned |
| Wave 3 | Hardening: storage hydration guard, desktop-icon reconciliation, FS sync event emission, prototype-pollution guards, builtin error type uniformity | ⏳ Planned |
| Wave 4 | Legacy retirement: drop `LEGACY_EVENT_MAPPING`, remove `CommandBus` facade, remove WS query-string auth, Terminal per-window state migration, remove `core/EventBus.js` re-export | ⏳ Planned |

Total time estimate from PR #1 to "final unified product": Wave 2 (3–4 PRs), Wave 3 (3–4 PRs), Wave 4 (3 PRs, depends on Wave 2/3 completion).

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

## Wave 2 — Source-of-truth consolidation

The largest single win. Once Wave 2 lands, "where is this owned?" has a single answer for every cross-cutting concern.

### W2.1 — `SubscriptionManager`

**Problem.** Subscribers accumulate. `EventBus.on(...)` returns an unsubscribe function that virtually nobody stores. Apps closing, features disabling, plugins unloading, and the logout cascade all leak.

**Solution.** A `SubscriptionManager` that:
- Wraps `SemanticEventBus.on`, `StateManager.subscribe`, `CommandBus.register`.
- Stores each subscription keyed by `ownerId` (`appId` / `featureId` / `pluginId` / `'session'`).
- Exposes `unsubscribeAll(ownerId)`.

**Integration.**
- `AppBase.handleClose` calls `unsubscribeAll(this.windowId)` then `unsubscribeAll(this.id)` once last window closes.
- `FeatureBase.disable` calls `unsubscribeAll(this.id)` (replaces the manual `eventUnsubscribers` array).
- `PluginLoader.unloadPlugin` calls `unsubscribeAll(pluginId)`.
- `SessionManager._teardown` adds `unsubscribeAll('session')` between `setSessionToken(null)` and `resetVolatile()`.

**Compatibility.** Existing `.on()` calls still work — the manager records them with the current `_currentOwnerId` (set by `AppBase`/`FeatureBase`/`PluginLoader` when invoking lifecycle). Apps/features that opt into `this.subscribe(...)` get auto-cleanup; raw `EventBus.on(...)` users keep the old (no-cleanup) semantics until migrated.

**Estimated PRs.** 1 — small, additive.

### W2.2 — `EventTopology`

**Problem.** Realtime event mapping is sprawled across three files: `RealtimeClient.bridgedEvents`, `index.js:694-799` SSE handlers, and the `MultiplayerClient` WS bridge. Drift is already present (`narrative.mood.shift` / `system.notification` wired in `index.js` but not `bridgedEvents`).

**Solution.** A single `core/EventTopology.js` listing every cross-process event:

```js
export const EventTopology = [
  {
    backendName: 'system.notification',
    frontendName: 'notification:show',
    transports: ['sse', 'ws'],
    handler: (payload) => { /* normalize */ }
  },
  // ...
];
```

`RealtimeClient`, the SSE handler in `index.js`, and `MultiplayerClient` all iterate this list.

**Estimated PRs.** 1.

### W2.3 — `CommandBus` facade

**Problem.** Two parallel registration mechanisms (`EventBus.on('command:*')` and `CommandBus.register`). Developers must choose. The bus already routes commands as events.

**Solution.** Add `registerCommand` / `executeCommand` to `SemanticEventBus`. Mark `CommandBus.js` `@deprecated`. `CommandBus.register` becomes a thin pass-through. No call-site changes required.

**Estimated PRs.** 1.

### W2.4 — `fetchWithAuth` + 401 trap

**Problem.** Backend expires tokens; frontend never notices and loops with a stale token. No reauth UI.

**Solution.** Add `fetchWithAuth(url, options)` to `ConfigLoader.js`:
- Adds `Authorization: Bearer <token>` and `X-Requested-With` automatically.
- On 401: clears the token, calls `SessionManager.logout({ reason: 'auth_expired' })`, emits `auth:expired` (schema already exists), shows reauth dialog.

Migrate the ~10 existing `fetch()` callers. Mechanical.

**Estimated PRs.** 1.

---

## Wave 3 — Hardening & drift cleanup

After Wave 2 lands, every cross-cutting concern has a single owner. Wave 3 cleans up the surviving drift and adds the small security guards the audit flagged.

### W3.1 — Storage hydration guard

`UserStateSync.isApplyingRemoteSnapshot` blocks remote sync but UI writes can still overwrite the incoming snapshot. Add `StorageManager.isHydrating()` flag and check it inside `StorageManager.set` — queue or drop writes during hydration.

### W3.2 — Desktop-icon reconciliation

Two sources of truth for desktop icons: `StateManager.icons` (loaded from `StorageManager.get('desktopIcons')`) and `Desktop/*.lnk` files in the VFS. Pick FS as the truth (matches the Win95 mental model). Boot hydrates `StateManager.icons` from `FileSystemManager.getDesktopShortcuts()`. `StateManager.icons` becomes a derived cache, refreshed via the existing FS events.

### W3.3 — FS-sync event emission

`syncDesktopIcons` and `syncInstalledApps` mutate the tree without emitting `FILESYSTEM_*` events. Apps subscribing to FS changes miss these mutations. Add emits or refactor to use `writeFile`/`createDirectory` paths that already emit.

### W3.4 — `StateManager.setStateAndPersist`

A single call that updates `StateManager.state` and `StorageManager.set` atomically, rolling back state if storage fails (quota / unavailable). Eliminates the "state changed but storage didn't" drift class.

### W3.5 — Storage payload guards

`StorageManager.set/get` use `JSON.parse` without prototype-pollution checks. Add a simple post-parse pass that rejects `__proto__` / `constructor.prototype` keys at the top level (and recursively, configurable).

### W3.6 — Icon coordinate bounds

`StateManager.addIcon` / `updateIconPosition` accept arbitrary numbers. Clamp to viewport / desktop bounds and reject NaN.

### W3.7 — Plugin manifest validation & transactional load

`PluginLoader` sets `loaded: true` before `onLoad()` runs. A plugin whose features fail to initialize is marked loaded anyway. Fix:
- Validate the manifest shape (required fields, ID uniqueness, declared dependencies exist) before any registration.
- Defer `loaded: true` until after `onLoad()` and all plugin features' `initialize()` succeed.
- On failure, unregister features and call `onUnload()`.

### W3.8 — Builtin error type uniformity

Some RetroScript builtins still throw bare `new Error(...)`; the rest throw `RuntimeError` with line/column info. Wrap bare throws at the visitor layer or fix each builtin.

### W3.9 — ScriptEngine context contract

Add `ScriptEngine.validateContext()` at engine init that fails fast if required services are missing, instead of 50+ inline `if (!context.X)` checks scattered through builtins.

### W3.10 — CommandBus fs commands path validation

`command:fs:write` / `command:fs:read` / `command:fs:mkdir` (in `core/CommandBus.js`) bypass the script-engine path validator. Add the same allowlist check at the CommandBus layer so script `emit "command:fs:write" { path: "C:/..." }` and write-statement `write $x to "C:/..."` apply identical guards.

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
