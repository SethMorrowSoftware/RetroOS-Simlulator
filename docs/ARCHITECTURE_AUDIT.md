# IlluminatOS! Architecture Audit

**Branch:** `claude/audit-architecture-2O0zk`
**Date:** 2026-05-14
**Scope:** Core eventing/state, app system, feature+plugin systems, RetroScript, windowing/filesystem/storage, backend+realtime integration.
**Goal:** Identify architectural issues blocking the project from being unified into a "rock solid, robust, reliable" system.
**Status:** Findings only. No source files modified.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Cross-Cutting Themes](#cross-cutting-themes)
3. [Per-Subsystem Findings](#per-subsystem-findings)
   - [3.1 Core Eventing & State](#31-core-eventing--state)
   - [3.2 Application System](#32-application-system)
   - [3.3 Feature & Plugin Systems](#33-feature--plugin-systems)
   - [3.4 RetroScript Engine](#34-retroscript-engine)
   - [3.5 Windowing, Filesystem, Storage](#35-windowing-filesystem-storage)
   - [3.6 Backend, Realtime, Multiplayer](#36-backend-realtime-multiplayer)
4. [Top 10 Unification Priorities](#top-10-unification-priorities)
5. [Implementation Guidance](#implementation-guidance)
6. [Appendix: Verified Findings](#appendix-verified-findings)

---

## Executive Summary

The codebase has **strong foundational patterns** — `SemanticEventBus` is well-designed, `AppBase` provides a solid multi-instance model, the `RetroScript` lexer/parser/interpreter pipeline is clean, the v2 backend has a single-entry router with proper middleware, and reconnect/backoff are in place for realtime channels.

However, six recurring weaknesses prevent the system from feeling unified or reliable:

1. **Lifecycle and cleanup are systemically broken.** Listeners leak across most subsystems; logout never tears down sockets; `FeatureBase.disable()/enable()` is non-idempotent; modal cleanup races on rapid close.
2. **Multiple competing sources of truth.** `StateManager` vs `StorageManager` drift; desktop icons live in two places; realtime event mapping is sprawled across three files; "active window" tracked in both DOM and state.
3. **Silent failures everywhere.** Subscriber errors are swallowed; failed features don't surface in the boot health report distinctly from user-disabled features; RetroScript builtins each handle missing services differently.
4. **Implicit contracts with no enforcement.** `WindowManager` injects raw content into innerHTML and trusts apps to escape; `EventSchema` is partial; `LEGACY_EVENT_MAPPING` rewrites event names invisibly.
5. **Security gaps that aren't dual-use, just gaps.** WebSocket token in URL query param; no client-side 401 trap; no path validation for script-driven file ops; prototype-pollution surface in `StorageManager` payloads.
6. **Cross-user data leakage on login switch.** `setUserScope()` clears the storage cache but leaves `StateManager` in-memory state from the previous user populated.

The remediation plan in [§4](#top-10-unification-priorities) is sequenced so that fixing lifecycle + cleanup (Wave 1) eliminates the largest class of bugs first, then source-of-truth consolidation (Wave 2) eliminates drift, then security hardening (Wave 3) closes the gaps.

The user's stated preference is **conservative refactoring with minimal churn** — recommendations are framed accordingly: introduce new APIs alongside old ones with deprecation warnings, prefer adapters over rewrites, avoid renaming/restructuring unless required.

---

## Cross-Cutting Themes

### CC-1: Lifecycle & Cleanup

The single largest class of bugs. Subsystems acquire resources (event listeners, timers, sockets, intervals, DOM nodes) but lack a unified mechanism to release them.

| Symptom | Location |
|---|---|
| `EventBus`/`StateManager`/`CommandBus` listeners accumulate forever; no per-owner unsubscribe | `SemanticEventBus.js:137`, `StateManager.js:241`, `CommandBus.js:845` |
| `FeatureBase.disable()` resets `initialized=false`, so `enable()` re-runs init and re-subscribes | `FeatureBase.js:137` (verified) |
| `WindowManager.createModal()` cleans up via a one-shot event listener — races on rapid close | `WindowManager.js:1199-1207` (verified) |
| No `user:logout` cascade. `MultiplayerClient.disconnect()`, `RealtimeClient.closeRealtime()`, `PresenceManager.destroy()` exist but are never called from logout | `MultiplayerClient.js:162`, `PresenceManager.js:204`, no caller |
| `AppBase.setContent()` replaces innerHTML without unregistering prior DOM listeners | `AppBase.js:558` |
| `StorageManager.destroy()` removes its storage event listener, but is never called | `StorageManager.js:484` |

### CC-2: Multiple Sources of Truth

Several pieces of state live in two or more places that drift independently.

| Truth conflict | Files |
|---|---|
| `StateManager.state.icons` vs `Desktop/*.lnk` files in the virtual FS | `StateManager.js:138`, `FileSystemManager.js:1710,2040` |
| `StateManager` cache vs `StorageManager` cache vs module-level caches (e.g. `AchievementSystem._achievementsCache`) | `StateManager.js`, `StorageManager.js`, `AchievementSystem.js:62` |
| Realtime event mapping in `RealtimeClient.bridgedEvents`, `index.js` SSE handlers, `MultiplayerClient` WS bridge | `RealtimeClient.js:29-65`, `index.js:694-799`, `MultiplayerClient.js:544-554` |
| Active window: `StateManager.ui.activeWindow` vs DOM `.active` class | `WindowManager.js:357,1131` |
| Path-allowlist for filesystem ops duplicated client-side and server-side | `index.js:700-718`, `FileController.php:43+` |

### CC-3: Silent Failure / No Observability

| Symptom | Location |
|---|---|
| Subscriber errors caught and `console.error`'d but never propagated | `SemanticEventBus._emitToListeners`, `StateManager.notifySubscribers` |
| Boot health report can't distinguish "user-disabled" from "crashed-on-init" | `FeatureRegistry.initializeAll`, `index.js` healthReport |
| RetroScript context-availability checks scattered across 50+ inline `if (!context.X)` paths with inconsistent behavior | `Interpreter.js:428-841`, `core/script/builtins/*` |
| Plugin marked `loaded:true` before `onLoad()` runs | `PluginLoader.js:124-128` |

### CC-4: Implicit Contracts

The system trusts callers to follow conventions that are documented but not enforced.

| Contract | Enforcement gap |
|---|---|
| Apps must `escapeHtml()` content before returning from `onOpen()` | `WindowManager.js:156` injects raw; lint script (`scripts/lint-innerhtml.sh`) is the only check; `AnalyticsDashboard.js` fails it |
| All events should be in `EventSchema` | App-scoped events (`command:appId:*`) dynamically created; ~30-40% of runtime events unvalidated |
| `LEGACY_EVENT_MAPPING` rewrites old event names in `.on()`/`.emit()` invisibly | `SemanticEventBus.js:22` |
| Multi-instance apps must use `setInstanceState()` | `Terminal.js:31-57` (verified) violates this — class-level `commandHistory`, `currentPath`, `aliases`, `envVars` shared across windows |
| Builtins must throw `RuntimeError` (with line/column) | Some throw bare `Error` |

### CC-5: Security Gaps

These are concrete, actionable gaps — not dual-use concerns.

| Gap | Location |
|---|---|
| WebSocket session token in URL query param — leaks to proxy logs, browser history, server access logs | `MultiplayerClient.js:101` (verified): `${wsUrl}?token=${encodeURIComponent(this.token)}` |
| No 401 trap anywhere in frontend; backend expires tokens, frontend never notices and loops with stale token | `UserStateSync.js:95-105`, `RealtimeClient.js:191-194` |
| RetroScript file ops pass paths to `FileSystemManager` with zero validation; `index.js` allowlist is client-side only | `Interpreter.js:578,588,606` (verified) |
| `StorageManager.set/get` use `JSON.parse` on payloads without prototype-pollution checks | `StorageManager.js:145,177` |
| No bounds checking on icon coordinates accepted by `StateManager.addIcon`/`updateIconPosition` | `StateManager.js:380,444` |

### CC-6: Cross-User Data Leakage

| Issue | Evidence |
|---|---|
| `setUserScope()` clears `StorageManager._cache` but leaves `StateManager.state.icons/windows` populated from the previous user | `StorageManager.js:42`, no caller resets `StateManager` in-memory state |
| `UserStateSync.isApplyingRemoteSnapshot` blocks remote sync but not direct `StorageManager.set()` from UI mutations during hydration — login-time UI writes can overwrite the incoming snapshot | `UserStateSync.js:126`, `StorageManager.js:169` |
| Pre-login writes go to global storage and get overwritten when user scope is set on login (acknowledged in `index.js:498-501` boot comments) | `index.js:498-501` |

---

## Per-Subsystem Findings

### 3.1 Core Eventing & State

**Files:** `core/EventBus.js`, `core/SemanticEventBus.js`, `core/EventSchema.js`, `core/schema/`, `core/StateManager.js`, `core/StorageManager.js`, `core/CommandBus.js`, `core/Sanitize.js`, `core/Constants.js`.

#### Critical issues

- **CommandBus duplicates EventBus semantics.** `CommandBus.register()` (`CommandBus.js:78`) is a parallel subscription mechanism; `command:*` events flow through `EventBus.on('command:*')` (`CommandBus.js:61`) and route to handlers. Two registration patterns create cognitive overhead — a developer must decide between `EventBus.emit('command:app:launch', ...)` vs `CommandBus.execute('app:launch', ...)`. Both paths exist.
- **No per-owner subscription tracking.** Subscribers accumulate. `StateManager.subscribe` (`StateManager.js:241`) returns an unsubscribe function but most callers (apps, features) never store or call it.
- **State drift between `StateManager` and `StorageManager`.** Both maintain independent caches. A direct `StorageManager.set()` from app code bypasses `StateManager.state`. A `setState(..., persist=true)` that fails on quota leaves `StateManager.state` and `StorageManager.cache` in disagreement.
- **`LEGACY_EVENT_MAPPING` is invisible.** `SemanticEventBus.js:22` auto-rewrites old event names inside `.on()` and `.emit()`. A developer cannot grep for the new name and find call sites that use the old name.
- **App-scoped events bypass schema.** `command:appId:*`, `app:appId:*`, `query:appId:*` are dynamically created (`SemanticEventBus.js:241-274`); the schema validation system has no awareness of them.
- **Errors swallowed in subscribers.** `SemanticEventBus._emitToListeners` and `StateManager.notifySubscribers` log errors but don't propagate. State subscribers throwing during a `state:change` notification leaves later subscribers uncalled with no signal.
- **`Sanitize.js` exists but is underused.** No usage in `SemanticEventBus`, `CommandBus`, `StateManager`, or `StorageManager`. Event payloads are logged unescaped (`SemanticEventBus.js:315`).

### 3.2 Application System

**Files:** `apps/AppBase.js`, `apps/AppRegistry.js`, sample apps (`Calculator.js`, `Notepad.js`, `Terminal.js`, `Browser.js`, `AdminPanel.js`), `core/WindowManager.js` (app-lifecycle integration).

#### Critical issues

- **`Terminal.js` violates the multi-instance contract.** Verified: `Terminal.js:31-57` stores `commandHistory`, `historyIndex`, `currentPath`, `aliases`, `activeProcess`, `envVars`, `batchCommands`, `_mpSession` on `this` (class-level), not via `setInstanceState()`. Terminal is not marked `singleton: true`. Two terminal windows share state — `cd` in window A changes window B's prompt; command history bleeds.
- **`AppBase.setContent()` accumulates handlers.** `AppBase.js:558` replaces innerHTML without first unregistering previous DOM listeners on the replaced subtree. `AdminPanel.js` calls `setContent()` multiple times in a session.
- **Implicit sanitization contract.** `WindowManager.create()` injects `content` into innerHTML at line 156. Apps must escape, but nothing enforces it. `AnalyticsDashboard.js` builds `<div class="ad-event">${e.timestamp} - ${e.action}</div>` without escaping — XSS-able if those values come from any untrusted source.
- **Two command-registration paths.** Some apps register commands in the constructor (Terminal, Browser, AdminPanel — fires before window context exists, captured `windowId = null`); others register in `onMount()` (Notepad, Calculator). `AppBase.registerCommand` cleans both up correctly but the dual-path is error-prone.
- **`onFocus`/`onBlur` lifecycle hooks exist but no sampled app overrides them.** Either remove or document a canonical use case.
- **`onMount()` re-runs on `setContent()`** but apps that initialized state in `onOpen()` don't re-initialize, creating inconsistency if content is swapped.

### 3.3 Feature & Plugin Systems

**Files:** `core/FeatureBase.js`, `core/FeatureRegistry.js`, `features/*`, `features/config.json`, `core/PluginLoader.js`, `plugins/features/*`.

#### Critical issues

- **`disable()` → `enable()` is non-idempotent.** Verified: `FeatureBase.js:137` sets `this.initialized = false` in `disable()`. Next `enable()` (line 93) re-runs `initialize()`. If `cleanup()` (line 161-168) is incomplete, the feature re-subscribes on top of stale subscriptions.
- **No mutex on enable/disable.** Two concurrent `enable()` calls can both pass the `if (!this.initialized)` check (line 93) and both run `initialize()`. `AppBase` has `_commandExecutionChain` to serialize commands; `FeatureBase` has no equivalent.
- **Cascading disable has no failure isolation.** `FeatureRegistry.disable()` walks dependents (e.g., `AchievementSystem` depends on `SoundSystem` per `features/config.json:44`); if one dependent's `cleanup()` throws, others are skipped. The feature graph is left partially disabled.
- **Implicit feature ↔ feature coupling via events.** `AchievementSystem.showToast` emits `sound:play` (`AchievementSystem.js:137`) without checking SoundSystem availability. If SoundSystem is disabled, the event is silently dropped.
- **Boot health doesn't distinguish failure modes.** `FeatureRegistry.initializeAll` records failures internally but neither `index.js` `healthReport` nor any UI surface distinguishes "user-disabled" from "crashed-on-init" from "dependency-missing".
- **Plugin loading is non-transactional.** `PluginLoader.js:124-128` sets `loaded: true` before `onLoad()` runs and before features' `initialize()` succeeds. A plugin whose features fail to initialize is still marked loaded.
- **No plugin manifest validation.** No version pinning, no dependency-existence check before registering plugin features.
- **Configuration drift across three sources.** `StorageManager`, `this.config`, `defaultConfig` (`FeatureBase.js:230-242`) — plus module-level caches like `_achievementsCache`. `setConfig()` updates storage but doesn't notify other features that depend on the value. Admin server-side config changes don't propagate to features that already loaded.

### 3.4 RetroScript Engine

**Files:** `core/script/` directory, `autoexec.retro`, `SCRIPTING_GUIDE.md`.

#### Strengths

The lexer → parser → interpreter pipeline is clean. Each script invocation gets its own isolated `Interpreter` (`ScriptEngine.js:137-149`), enabling concurrent scripts. Safety limits (loop iterations, recursion depth, string length, timeouts) are enforced. Sandboxing blocks `window`, `document`, `globalThis`, `Function`, `eval` (`Interpreter.js:981-994`). Prototype-pollution prevention in property access (`Environment.js:12`, `Interpreter.js:953-968`). Persistent interpreter sessions properly garbage-collected.

#### Critical issues

- **No file path validation for script-driven file ops.** Verified: `Interpreter.js:578` (`writeFile`), `:588` (`readFile`), `:606` (`deleteFile`) pass paths directly to `FileSystemManager` with no validation. The `index.js:700-718` allowlist applies only to SSE-driven remote ops, not script ops. Defense-in-depth is missing — even if `FileSystemManager` validates, the script engine should too.
- **Inconsistent context-service handling.** 50+ inline `if (!context.X)` checks across builtins. Some warn (`Interpreter.js:431,489`), some silently no-op, some throw. No single contract documenting which services are required vs optional per builtin.
- **Inconsistent error types.** Some builtins throw bare `new Error()` rather than `RuntimeError` with line/column/hint info.
- **Undocumented hardcoded timeouts.** Dialog confirm/prompt have a 30-second timeout (`Interpreter.js:631,660`) not mentioned in the scripting guide.
- **Print statement has two parsing modes** (expression vs unquoted text) per `SCRIPTING_GUIDE.md` § 19. The mode-switching conditions are fragile — `print $count + 5` could yield arithmetic or literal output depending on context.
- **Event handler state isolation is by-design** (`Interpreter.js:454-474` saves/restores environment) but documented as a "gotcha". Handlers can't accumulate state across fires without an external store.
- **No tests for concurrent scripts, race conditions in handlers, or path traversal.** The Node test harness (`scripts/test-retroscript.mjs`) covers core syntax but excludes browser-bound builtins (Multimedia, Dialog, System, Messaging).

### 3.5 Windowing, Filesystem, Storage

**Files:** `core/WindowManager.js`, `core/FileSystemManager.js`, `core/StorageManager.js`, `core/UserStateSync.js`, `core/StateManager.js` (interaction surfaces).

#### Critical issues

- **Cross-user data leakage on login.** `StorageManager.setUserScope()` clears the cache but `StateManager.state` is left populated. User A's icons, windows, and settings can briefly bleed into user B's session before the post-login `StateManager.initialize()` runs. The window between login resolution and re-init is non-zero.
- **Hydration can be overwritten.** `UserStateSync.isApplyingRemoteSnapshot` flag blocks remote sync scheduling but `StorageManager.set()` from UI doesn't check it. A window-close during hydration can overwrite the incoming snapshot's window list.
- **Modal cleanup race.** Verified: `WindowManager.js:1199-1207` registers a one-shot `WINDOW_CLOSE` event listener to pop from `_modalStack`. Two modals closing in rapid succession can race — second emit fires before first handler unsubscribes. Modal stack drifts; subsequent input gets blocked by a stale overlay.
- **Desktop icon dual source of truth.** `StateManager.icons` (loaded from `StorageManager.get('desktopIcons')` at boot, `StateManager.js:138`) and `Desktop/*.lnk` files in the virtual FS (written by `FileSystemManager.syncDesktopIcons` at `:1710`). The reverse direction (`getDesktopShortcuts` at `:2040`) is never read on boot. User-added icons in the FS are not reflected back to `StateManager`.
- **Path normalization inconsistency.** `FileSystemManager.normalizePathSegments` (`:122-144`) lowercases segments, but tree nodes are likely inserted with original case. Lookups normalized; insertions not normalized. Case collisions possible.
- **Quota-exceeded recovery is opaque.** `StorageManager.set()` (`:185-202`) on quota error → `cleanup()` → retry. Cleanup may delete other keys; if retry fails, the in-memory `_cache` is inconsistent with localStorage and the caller doesn't know which state was lost.
- **FS sync operations bypass events.** `syncDesktopIcons` (`:1710-1780`) and `syncInstalledApps` (`:1783-1870`) directly mutate the tree without emitting `FILESYSTEM_*` events. Apps subscribed to FS changes don't observe these mutations.
- **`StorageManager.destroy()` is never called.** Storage event listener leaks across page sessions in long-lived tabs.

### 3.6 Backend, Realtime, Multiplayer

**Files:** `core/ConfigLoader.js`, `core/RealtimeClient.js`, `core/MultiplayerClient.js`, `core/PresenceManager.js`, `core/GameSession.js`, `core/UserStateSync.js`, `core/LoginScreen.js`, `api/v2/index.php`, `backend/bootstrap.php`, `backend/Middleware.php`, `backend/services/*`, `websocket/server.php`.

#### Strengths

Single-entry v2 API router with middleware chain. Token-based auth with CSRF sentinel header (`X-Requested-With`). Rate limiting per user/IP. Reconnect with exponential backoff in both `RealtimeClient` (max 10) and `MultiplayerClient`.

#### Critical issues

- **WebSocket token in URL query parameter.** Verified: `MultiplayerClient.js:101`: `new WebSocket(\`${wsUrl}?token=${encodeURIComponent(this.token)}\`)`. URL is logged by intermediate proxies, browser history, server access logs.
- **No 401 handling on the frontend.** Backend expires tokens (`Middleware.php:83`); frontend continues calling endpoints with the dead token. `UserStateSync.js:95-105` and `RealtimeClient.js:191-194` log warnings but don't trigger reauth.
- **No logout cascade.** `MultiplayerClient.disconnect()`, `RealtimeClient.closeRealtime()`, `PresenceManager.destroy()` exist but no caller invokes them on logout. Sockets stay open with stale tokens; presence leaks; reconnect loops burn cycles.
- **Realtime event mapping sprawled across three files.** `RealtimeClient.js:29-65` `bridgedEvents` array; `index.js:694-799` 29 separate `EventBus.on('sse:*')` handlers; `MultiplayerClient.js:544-554` WS bridge with different `mp:*` prefix. Drift already present — `narrative.mood.shift` and `system.notification` are wired in `index.js` but not in `bridgedEvents`.
- **No deduplication when same event arrives via SSE and WS.** Different prefixes mean two handlers fire.
- **No token refresh.** Sessions just expire. Active users get logged out mid-session.
- **No offline-degradation mode.** `GameSession.js:55-58,100-104` checks connection and warns/returns null with no fallback. `PresenceManager` clears users on disconnect with no offline indicator. Single-player games and local FS still work, but the UI doesn't communicate which features are degraded.
- **Multiplayer state uses last-write-wins.** `GameSession.js:346-351`: `Object.assign(this.gameState, data.delta)`. `NarrativeStateManager.js:811,838,868,911` explicitly documented LWW. No version vectors, no conflict detection, no operational transform. Two simultaneous moves clobber each other.
- **Path allowlist duplicated client-side.** `index.js:700-718` for SSE remote FS ops; backend has its own (`FileController.php:43+`) that may diverge.

---

## Top 10 Unification Priorities

Ranked by reliability impact × implementation effort. Each lists the smallest viable change consistent with the conservative-churn stance.

### Wave 1 — Lifecycle & Cleanup (highest leverage)

**P1. Owner-scoped subscription tracker.**
A new `SubscriptionManager` that wraps `EventBus.on`, `StateManager.subscribe`, `CommandBus.register`, and stores each subscription keyed by `ownerId` (appId, featureId, pluginId, sessionId). Adds `unsubscribeAll(ownerId)`. `AppBase.handleClose`, `FeatureBase.disable`, `PluginLoader.unloadPlugin`, and a new logout cascade call this. Backwards-compat: existing `.on()` calls still work; ownership is opt-in via a new `.scope(ownerId).on(...)` overload.
*Files touched:* new `core/SubscriptionManager.js`; thin wrapper in `SemanticEventBus.js`, `StateManager.js`, `CommandBus.js`; integration in `AppBase.js`, `FeatureBase.js`, `PluginLoader.js`.

**P2. Unified logout / user-switch cascade.**
Single `user:logout` and `user:switch` events. Subscribers (in registration order):
1. `MultiplayerClient.disconnect()`
2. `RealtimeClient.closeRealtime()`
3. `PresenceManager.destroy()`
4. `SubscriptionManager.unsubscribeAll('session')`
5. `ConfigLoader.setSessionToken(null)`
6. `StateManager.resetVolatile()` (new — clears in-memory state without touching storage)
7. `StorageManager.setUserScope(newUser)` (or null on logout)
*Files touched:* `LoginScreen.js`, `MultiplayerClient.js`, `RealtimeClient.js`, `PresenceManager.js`, `ConfigLoader.js`, `StateManager.js`, `StorageManager.js`, new wiring in `index.js`.

**P3. Fix `FeatureBase` lifecycle semantics.**
- Remove `this.initialized = false` from `disable()` (`FeatureBase.js:137`).
- `disable()` calls `cleanup()` and sets `enabled = false` only.
- Add per-feature `_lifecycleLock` (Promise queue) to serialize enable/disable.
- Wrap dependent-disable in try/catch with structured failure event.
- Backwards-compat: any feature that relied on disable+enable forcing reinit should override `disable()` to re-call `initialize()` explicitly.
*Files touched:* `FeatureBase.js`, `FeatureRegistry.js`.

**P4. Modal cleanup via direct callback, not event listener.**
`WindowManager.createModal` should store the modal-cleanup function on the window node and invoke it deterministically inside `close()`, rather than via a `WINDOW_CLOSE` listener.
*Files touched:* `WindowManager.js:1188-1210, 482-514`.

### Wave 2 — Source of Truth & Schema

**P5. Collapse `CommandBus` into `SemanticEventBus`.**
Conservative path: keep `CommandBus.js` as a thin facade that delegates to a new `SemanticEventBus.registerCommand/executeCommand` API. Mark the file `@deprecated`. New code uses the unified API.
*Files touched:* `SemanticEventBus.js`, `CommandBus.js`, no immediate call-site changes.

**P6. Centralize realtime event topology.**
New `core/EventTopology.js` lists every backend event, its frontend internal name, and its SSE/WS bridge handler. `RealtimeClient.bridgedEvents` and `index.js:694-799` SSE handlers and `MultiplayerClient` WS bridge all consult it. Eliminates drift.
*Files touched:* new `core/EventTopology.js`; refactor `RealtimeClient.js:29-65`, `index.js:694-799`, `MultiplayerClient.js:544-554`.

**P7. Reconcile desktop icons + atomic state↔storage writes.**
- Pick FS as truth for desktop icons (the Win95 mental model). On boot, `StateManager.icons` is hydrated from `getDesktopShortcuts()` rather than `StorageManager.get('desktopIcons')`.
- Add `StateManager.setStateAndPersist(path, value)` that writes both atomically (rolls back on storage failure).
- Add `StorageManager.isHydrating()` flag set by `UserStateSync` and respected by `StorageManager.set()` (queues writes during hydration).
*Files touched:* `StateManager.js`, `StorageManager.js`, `FileSystemManager.js`, `UserStateSync.js`, `index.js` (boot order).

### Wave 3 — Security & Hardening

**P8. RetroScript file path validation + context contract.**
- `ScriptEngine.validateContext()` runs at engine init; fails fast if required services missing.
- New `ScriptEngine.validateScriptPath(path)` whitelist (mirrors `index.js:700-718` allowlist). Called by `Interpreter` file-op visitors.
- Standardize all builtins on `RuntimeError` with location info — wrap bare errors at the visitor layer.
*Files touched:* `core/script/ScriptEngine.js`, `core/script/interpreter/Interpreter.js:578-611`, builtins.

**P9. Auth hardening.**
- `fetchWithAuth()` wrapper in `ConfigLoader.js`: traps 401, clears token, emits `auth:expired`, shows reauth dialog.
- Migrate all `fetch()` callers to `fetchWithAuth` (small, mechanical change).
- WebSocket auth via subprotocol: `new WebSocket(url, ['token.<jwt>'])` — backend WebSocket server reads from `Sec-WebSocket-Protocol`. Removes token from URL.
*Files touched:* `ConfigLoader.js`, all fetch callers (~10 sites), `MultiplayerClient.js:101`, `websocket/server.php` auth handler.

**P10. Plugin manifest validation + transactional load.**
- Validate manifest schema before any registration.
- Validate declared feature dependencies exist in `FeatureRegistry`.
- Defer `loaded: true` until after `onLoad()` AND all plugin features' `initialize()` succeed.
- Roll back fully on partial failure (unregister features, call `onUnload`).
*Files touched:* `PluginLoader.js:107-228`.

---

## Implementation Guidance

### Sequencing rationale

Wave 1 first because:
- Lifecycle bugs cause the most user-visible flakiness (mystery state, leaks, dead sockets, login bleeding).
- The `SubscriptionManager` and logout cascade are prerequisites for Wave 2's reconciliation work — you can't safely flip the desktop-icon source of truth without confidence that subscribers update consistently.
- Most Wave 1 items are additive (new APIs alongside old ones) so they fit the conservative-churn stance.

Wave 2 next because once cleanup is reliable, the remaining bugs are mostly drift between sources of truth.

Wave 3 last because the security gaps (while real) are exploitable mostly by authenticated users in unusual conditions; the lifecycle/drift bugs degrade reliability for every user every session.

### Conservative-churn principles to follow

Per the chosen compat stance:
- **Add APIs, don't rename.** New `EventTopology`, `SubscriptionManager`, `fetchWithAuth` live alongside existing code. Old call sites continue to work.
- **Mark deprecated, don't delete.** `CommandBus.js` becomes a facade; flag with `@deprecated` JSDoc and a `console.warn` on construction.
- **Avoid mass refactors.** Don't rewrite `StateManager` — extend it with `resetVolatile()` and `setStateAndPersist()`.
- **Targeted fixes for verified bugs.** `Terminal.js` multi-instance fix, `FeatureBase.js:137` removal, `WindowManager.js:1199-1207` cleanup change — small, surgical.
- **Per-PR scope:** one wave per PR is too big. Aim for 3-4 PRs per wave, each independently mergeable.

### Test strategy

The repo has limited automated tests. Before each PR:
- `bash scripts/lint-innerhtml.sh` — must pass.
- `php test-backend.php` and `php test-security.php` — must pass for backend changes.
- `node scripts/test-retroscript.mjs` — must pass for script-engine changes.
- Manual smoke: boot in browser, check `window.__OS_BOOT_HEALTH` for degraded components, open a few apps, log out, log in as a different user, verify no state bleed.

For the lifecycle work, add targeted unit tests:
- `SubscriptionManager.unsubscribeAll(ownerId)` actually frees handlers.
- `FeatureBase.enable()→disable()→enable()` doesn't re-subscribe.
- `WindowManager.createModal()` two close in quick succession leaves stack empty.

### What this audit deliberately does not address

- **CSS/styling consistency** — out of scope, but worth a separate audit; 53 files in `styles/` with stated import-order requirements is a fragility surface.
- **Backend-side architecture** — middleware, models, controllers are spot-checked only. A separate PHP audit would be valuable.
- **Build/deploy pipeline** — no build step is a feature, but service worker / cache invalidation strategy was not examined.
- **Specific app bugs** — the per-app audit was a sample (5 of 44). Each app likely has its own issues that surface once the AppBase contract is enforced.
- **Performance profiling** — no measurements were taken; recommendations are structural, not perf-driven.

---

## Appendix: Verified Findings

The following high-impact claims were independently verified by reading the source after the audit agents reported them:

| Claim | File:Line | Status |
|---|---|---|
| WebSocket token in URL query param | `MultiplayerClient.js:101` | Verified — `new WebSocket(\`${wsUrl}?token=${encodeURIComponent(this.token)}\`)` |
| `FeatureBase.disable()` resets `initialized` | `FeatureBase.js:137` | Verified — `this.initialized = false;` |
| Terminal uses class-level state for multi-instance fields | `Terminal.js:31-57` | Verified — `commandHistory`, `currentPath`, `aliases`, `envVars`, etc. on `this`, not `setInstanceState` |
| Modal cleanup via one-shot listener | `WindowManager.js:1199-1207` | Verified — `closeHandler` registered with `EventBus.on(Events.WINDOW_CLOSE)` |
| RetroScript file ops without path validation | `Interpreter.js:578,588,606` | Verified — `FileSystem.writeFile(path, ...)`, `FileSystem.readFile(path)`, `FileSystem.deleteFile(path)` |

All other findings are sourced from agent reports with file:line citations; the agents read the relevant source files but their summaries were not independently re-verified line by line. Treat this audit as a starting point for fixes — confirm specifics before refactoring.
