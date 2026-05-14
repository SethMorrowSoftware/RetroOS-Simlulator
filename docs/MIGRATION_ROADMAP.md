# IlluminatOS! Migration Roadmap

**Owner:** core platform
**Predecessor:** `docs/UNIFIED_ROADMAP.md` — the platform-level unification work (Waves 1–4) landed in PRs #1 and #2.
**Scope:** Now that the platform APIs are unified, this document tracks the call-site migration needed to make every app, feature, and integration use them consistently.

This is intentionally a *second* roadmap, separate from `UNIFIED_ROADMAP.md`. The platform side is "done" — `SubscriptionManager`, `EventTopology`, `fetchWithAuth`, `setStateAndPersist`, and friends all exist and are wired into the lifecycle base classes. What's left is mechanical: walk through the 44 apps and 12 features, swap legacy patterns for the new ones, and verify nothing regresses.

---

## Table of contents

1. [Phase 0 — Verification & baseline](#phase-0--verification--baseline)
2. [Phase 1 — App + feature audit and migration](#phase-1--app--feature-audit-and-migration)
3. [Phase 2 — Internal cleanup](#phase-2--internal-cleanup)
4. [Phase 3 — Documentation polish](#phase-3--documentation-polish)
5. [Per-app migration checklist](#per-app-migration-checklist)
6. [Skipped items (with rationale)](#skipped-items-with-rationale)
7. [Operating rules during migration](#operating-rules-during-migration)

---

## Phase 0 — Verification & baseline

Before touching any app, prove the platform actually does what the roadmap claims.

### P0.1 — Manual smoke checklist

Run through each scenario and capture screenshots in `docs/smoke/`:

- [ ] **Cold boot.** Open in a private window. Check `window.__OS_BOOT_HEALTH` — every component shows `status: "ok"`, no entry shows `degraded`.
- [ ] **App open/close loop.** Open Notepad, Calculator, Browser, Terminal, MyComputer. Close each one. Run `window.__RETROS_DEBUG.subscriptionManager.getTotalCount()` — should return `0` (or very small steady-state for system listeners). Run `window.__RETROS_DEBUG.subscriptionManager.getOwnerCounts()` — no app/window IDs should appear.
- [ ] **Logout-as-different-user.** Log in as User A, drag icons around, open 3 apps, log off. Log in as User B. User A's icons / window positions / settings must not be visible. Run `__OS_BOOT_HEALTH` again — still no degraded components.
- [ ] **Auth expiry.** With the backend running, log in. Stop the PHP backend mid-session (`kill <pid>`). Wait for the next API call (e.g. trigger a save). Verify: ONE `auth:expired` event in the bus log, NO infinite reconnect loop, NO unhandled 401 spam in the console.
- [ ] **Prototype-pollution rejection.** In the console: `__RETROS_DEBUG.storageManager.set('test', { __proto__: { evil: 1 } })` returns `false` and `storageManager.getTelemetry().unsafeKeyRejections` is `1`.
- [ ] **Hydration drop.** With a logged-in user, force `__RETROS_DEBUG.storageManager.beginHydration()`, then `storageManager.set('foo', 'bar')`. Returns `false`, `telemetry.hydrationDrops === 1`. Call `endHydration()` to recover.
- [ ] **Plugin manifest rejection.** Load a plugin manifest with duplicate feature IDs. PluginLoader logs `Rejected plugin: duplicate feature id "..."` and the plugin doesn't register.
- [ ] **Two Terminal windows.** Open Terminal twice (now possible since `singleton: true` was removed). `cd C:\Windows` in window A. Type `cd` in window B (which should still print `C:\Users\User`). Verify state doesn't bleed.
- [ ] **Icon FS reconcile.** From window A: `mkdir C:\Users\User\Desktop\TestShortcut.lnk`-ish (use Terminal to write a `.lnk` file). Close and reopen IlluminatOS. The shortcut should appear on the desktop.

If any of these fail, the platform claim is wrong — fix the platform before continuing.

### P0.2 — Baseline diagnostics dump

Once smoke passes, capture the steady-state numbers so future PRs can compare:

```js
const baseline = {
    bootHealth: window.__OS_BOOT_HEALTH,
    subscriptions: __RETROS_DEBUG.subscriptionManager.getOwnerCounts(),
    commands: __RETROS_DEBUG.eventBus.getCommands().length,
    listeners: __RETROS_DEBUG.eventBus.getActiveListeners(),
    storageTelemetry: __RETROS_DEBUG.storageManager.getTelemetry(),
};
copy(JSON.stringify(baseline, null, 2));
```

Save to `docs/diagnostics-baseline.json`.

---

## Phase 1 — App + feature audit and migration

Walk every app and feature once. Apply the per-app checklist below to each. Each app is its own small PR (or batch of 2–3 related apps), not one giant migration PR.

### Sweep order (recommended)

1. **Tier A — high traffic, simple shape:** `Calculator`, `Notepad`, `Clock`, `Calendar`, `Minesweeper`, `FreeCell`. Single window content, few subscriptions. Use these to prove the migration pattern is solid before tackling complex apps.
2. **Tier B — file-aware:** `Paint`, `MediaPlayer`, `HelpSystem`, `FindFiles`, `Browser`. These call `fetch()` (server-backed assets, file ops) and need `fetchWithAuth` migration.
3. **Tier C — feature-rich:** `AdminPanel`, `AnalyticsDashboard`, `ControlPanel`, `Inbox`, `ChatRoom`, `InstantMessenger`, `Defrag`, `HyperCard`, `CampaignStudio`, `BonziBuddy`, `DOSBox`, `Doom`, `Asteroids`, `MyComputer`, `Reversi`, `Solitaire`, `Spider`, `Hangman`, `Pong`, `Snake`, `Tetris`, `GameLobby`, `DisplayProperties`, `FeaturesSettings`. Many small per-app quirks — go in groups of 2–3.
4. **Tier D — singletons-by-design:** any app that legitimately should remain single-instance (Settings panels, GameLobby host, etc.). Audit but mark `singleton: true` deliberately.

### Features

Same per-feature checklist applies to:
- `SoundSystem`, `AchievementSystem`, `EasterEggs`, `ClippyAssistant`, `DesktopPet`, `Screensaver`, `SystemDialogs`, `CampaignManager`, `MoodOrchestrator`, `ContentTemplateManager`, `OnlineUsers`, `Notifications`.

Features should already be in OK shape because Wave 1 hardened `FeatureBase` lifecycle. The main thing to verify per feature: subscriptions registered inside `initialize()` are released on `disable()` (the `SubscriptionManager` integration in PR #2 makes this automatic, but verify by toggling each feature off/on twice and watching `getOwnerCounts()`).

---

## Per-app migration checklist

Apply this to every app. None of these are blocking on each other — pick whichever applies.

### 1. Multi-instance compliance

- [ ] Does the app's constructor or class body assign per-window state to `this.<field>`? Examples: `this.canvasCtx`, `this.currentFile`, `this.activeTab`.
- [ ] If yes: either (a) move each field to `setInstanceState` / `getInstanceState`, or (b) use the property-accessor pattern (`Object.defineProperty(MyApp.prototype, 'field', {...})`) like Terminal does, or (c) keep `singleton: true` deliberately and document why.
- [ ] Verify by opening two windows of the app simultaneously and exercising the feature that uses the field.

### 2. Subscription hygiene

- [ ] In `onMount` / `onOpen` / `initialize`, every `EventBus.on(...)` call without `this.onEvent(...)` / `this.subscribe(...)` is fine — `SubscriptionManager.runAs(...)` wraps lifecycle entry points, so raw `.on()` calls are tracked automatically.
- [ ] BUT: any `EventBus.on(...)` called from the app's **constructor** runs before any window exists and goes into the global subscription pool. Either move it to `onMount`, or accept that it survives app shutdown.
- [ ] Verify by toggling the app's only window open/close several times and checking `__RETROS_DEBUG.subscriptionManager.getOwnerCounts()` returns to baseline.

### 3. Command/query registration

- [ ] If the app registers app-specific commands via `this.registerCommand(action, handler)`, leave it alone — that path already uses `EventBus.registerCommand` underneath.
- [ ] If the app calls `CommandBus.register(name, handler)` directly: migrate to `EventBus.registerCommand(name, handler)` (cosmetic; both write to the same registry).
- [ ] If the app calls `CommandBus.execute('foo', payload)`: migrate to `EventBus.executeCommand('foo', payload)`.

### 4. Authenticated HTTP

- [ ] Grep the app for `fetch(`. Every backend (`/api/v2/...`) call should use `fetchWithAuth` from `ConfigLoader`.
- [ ] Frontend-only fetches (CDN assets, public images) can stay on raw `fetch` — `fetchWithAuth` adds Authorization headers, which servers without auth might reject.
- [ ] Login / register flows intentionally use raw `fetch` (a 401 there means "wrong password," not "session expired").

### 5. State persistence

- [ ] If the app does `StorageManager.set(...)` followed by `StateManager.setState(...)` (or vice versa) and expects them to stay consistent: migrate to `StateManager.setStateAndPersist(path, value)`.
- [ ] If the app reads a value from `StorageManager.get(key)` and that value is user-controlled JSON, no action — the prototype-pollution guard already rejects bad payloads.

### 6. Cross-process events

- [ ] If the app subscribes to `sse:foo.bar` directly: check if a semantic name exists in `core/EventTopology.js`. If yes, subscribe to that instead (the `sse:` alias still fires for compat, but new code should use the semantic name).
- [ ] If the app needs a new server event that should bridge to the frontend: add an entry to `EventTopology.js`. Do not edit `RealtimeClient.bridgedEvents` directly (it's derived from the topology).

### 7. innerHTML safety

- [ ] Run `bash scripts/lint-innerhtml.sh` after migration. If it flags the app, import `escapeHtml` / `escAttr` from `core/Sanitize.js` and wrap user-controlled values.

### 8. Smoke test

- [ ] Open the app, exercise its primary flows, close it. Run `__RETROS_DEBUG.subscriptionManager.getOwnerCounts()` — should not show the app's IDs.
- [ ] Open two windows of the app (unless `singleton: true`). Verify they don't share state.

---

## Phase 2 — Internal cleanup

Once the apps are migrated, the platform itself has follow-up tidying that's now safe to do.

### P2.1 — Delete `core/CommandBus.js` (or shrink to a re-export)

**Status:** open. **Blocker:** the 15 `CommandBus.execute(...)` call sites inside `core/script/interpreter/Interpreter.js` and `core/script/builtins/*.js`.

Steps:
1. Migrate each call site: `CommandBus.execute(...)` → `EventBus.executeCommand(...)`.
2. Move the timer + macro handler state (`this.timers`, `this.macros`, `this.isRecording`, etc.) into either a new `core/CommandRegistry.js` or directly into `SemanticEventBus`.
3. Drop the `command:*` wildcard router (or keep it as a top-level subscription in the new home).
4. Delete `core/CommandBus.js`.
5. Update `index.js` to call `CommandRegistry.initialize(...)` instead of `CommandBus.initialize()`.

**Estimated effort:** 1 small PR. Mechanical.

### P2.2 — Migrate `EventBus.executeCommand` callers off `context.CommandBus`

The `ScriptEngine.initialize(context)` currently passes `CommandBus` in the context object. Scripts/builtins reach into `context.CommandBus.execute(...)`. Migrate to `context.EventBus.executeCommand(...)`, then drop `CommandBus` from the context.

**Estimated effort:** 1 small PR. Done as part of P2.1.

### P2.3 — Reauth UI for `auth:expired`

When `fetchWithAuth` fires `auth:expired`, no UI subscriber listens yet. Add a feature (or extend `SystemDialogs`) that shows a modal "Your session expired — please log in again" → routes to `LoginScreen`.

**Estimated effort:** 1 small PR.

### P2.4 — Bidirectional desktop-icon sync

W3.2 currently does FS → state at boot only. For full bidirectional sync at runtime: subscribe to `filesystem:directory:changed` for `Desktop/`, re-run `reconcileIconsFromFileSystem` (with a "source" check to avoid feedback loops with `syncDesktopIcons`).

**Estimated effort:** 1 small PR, but needs care around the feedback loop.

### P2.5 — Drop `core/EventBus.js` re-export

**Decision:** ⏳ Indefinitely skipped. See [Skipped items](#skipped-items-with-rationale).

### P2.6 — Module-level cache drift (Cross-Cutting Theme CC-2)

`AchievementSystem._achievementsCache` (and similar in other features) maintain module-level caches that drift from `StateManager.state.achievements`. Either:
- Drop the cache and read through `StateManager.getState(...)` every time, or
- Make the cache invalidation subscribe to `state:change` for the relevant path.

**Estimated effort:** 1 small PR per feature.

### P2.7 — Active-window dual source of truth (Cross-Cutting Theme CC-2)

`StateManager.ui.activeWindow` and the DOM `.active` class can drift. Pick one as truth — the state value, since the DOM class is a presentation detail — and have `WindowManager` read/write only the state value, with the DOM class as a derived view.

**Estimated effort:** 1 small PR.

### P2.8 — `AppBase.setContent()` replaces innerHTML without unregistering DOM listeners

Wave 1 noted this as still-open. The DOM event handlers stored in `instanceData.boundHandlers` aren't released when `setContent()` swaps the HTML, so old listeners point at detached DOM nodes (no harm, but no value either). Either clean up in `setContent` or document that `setContent` callers must re-bind their handlers.

**Estimated effort:** 1 small PR.

### P2.9 — Pre-login storage drift

`index.js:498-501` notes that pre-login writes go to global storage and get overwritten when user scope is set on login. Wave 4 didn't address this. Either defer all storage writes until after login, or queue them and replay into the user scope on login.

**Estimated effort:** 1 small PR.

---

## Phase 3 — Documentation polish

After P0–P2 finish, the docs need a sweep:

- [ ] `README.md` — update with the new APIs (SubscriptionManager, EventTopology, fetchWithAuth, setStateAndPersist).
- [ ] `DEVELOPER_GUIDE.md` — already updated through Wave 3; add a Phase 1 case study showing one app's migration end-to-end.
- [ ] `SCRIPTING_GUIDE.md` — once P2.1/P2.2 land, document that scripts should call `EventBus.executeCommand` rather than `CommandBus.execute`.
- [ ] `docs/ARCHITECTURE_AUDIT.md` — mark Cross-Cutting Themes that close during Phase 2 as ✅.
- [ ] Archive `docs/UNIFIED_ROADMAP.md` and this file once Phase 2 completes — both become historical record.

---

## Skipped items (with rationale)

These were on the original roadmap but were deliberately not done. Documented here so a future audit doesn't re-discover them as "missing."

### `core/EventBus.js` re-export removal (W4.5)

**Decision:** keep the re-export.

`core/EventBus.js` is a 30-line file that just does `export { default, Events, Priority, SemanticEventBus, EventBus } from './SemanticEventBus.js'`. Removing it would force ~75 imports across the codebase to change their `from './EventBus.js'` to `from './SemanticEventBus.js'`. That's high churn for zero functional benefit — both forms reference the same singleton.

If we ever rename `SemanticEventBus.js` (unlikely), revisit this.

### Renaming `core/CommandBus.js` to `core/CommandRegistry.js`

**Decision:** keep the existing name *or* relocate as part of P2.1.

The "Bus" framing is historically inaccurate (the file is now a handler registry, not a pub/sub bus), but a pure rename creates noise for everyone updating their PRs. Either rename happens as part of P2.1 (when we're already deleting / restructuring the file), or it doesn't happen — but not in isolation.

### Path-allowlist parity between client and server (CC-2 row 5)

**Decision:** scope to backend audit.

The client-side allowlist in `core/script/utils/PathValidation.js` is fully unified across script + SSE + CommandBus surfaces. The server-side allowlist lives in `backend/controllers/FileController.php` and is its own validation, applied to *server-stored* paths (which are a different namespace than the virtual FS). Unifying the two would require a shared schema, which is a PHP-side refactor — out of scope for the JS unification effort. Tracked in a hypothetical future "backend audit" doc.

### CSS unification

**Decision:** out of scope for the JS architecture work. 53 CSS files with import-order requirements is a real fragility surface, but it's orthogonal. Spin up a sibling roadmap if/when it matters.

### Performance profiling

**Decision:** out of scope. No measurements taken; recommendations would be guesses.

---

## Operating rules during migration

These rules apply to every PR in Phase 1 and Phase 2.

- **One app per PR, or one tightly related group.** A "migrate Notepad" PR is fine. A "migrate every app" PR is not — diff review becomes infeasible.
- **Run the smoke checklist after each PR.** Even if your PR only touches one app, regressions in the platform are how `SubscriptionManager` leaks creep in.
- **Update this document.** When you complete an app, check the box in the [Per-app migration checklist](#per-app-migration-checklist). When you finish a Phase 2 item, move it to "Done" with a PR link.
- **Don't add new uses of legacy patterns.** If you find yourself writing `CommandBus.execute(...)` in a new file: stop, use `EventBus.executeCommand(...)`. Same for raw `fetch(...)`, raw `StorageManager.set(...)` next to `StateManager.setState(...)`, etc.
- **If the platform is missing something:** stop the app migration and add it to the platform first. The whole point of the unification was to make app code thinner. If migrating an app makes it *more* complex, the platform isn't doing its job.

---

## Status snapshot

| Phase | Theme | Status |
|---|---|---|
| Phase 0 | Verification & baseline | ⏳ Pending — needs manual smoke (no automated harness for these scenarios) |
| Phase 1 | App + feature audit and migration | ⏳ Pending — 44 apps + 12 features to walk |
| Phase 2 | Internal cleanup | ⏳ Pending — 9 items |
| Phase 3 | Documentation polish | ⏳ Pending — gated on Phase 2 |

Total effort estimate: roughly one PR per app/feature (Phase 1) + one PR per Phase 2 item ≈ **50–60 small PRs**. Most are individually trivial; the total represents the long tail of "all the existing code now needs to use the new APIs the platform exposes."

Nothing here is urgent. The platform works today. Migration is a hygiene effort, not a feature delivery.
