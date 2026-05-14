# IlluminatOS! Known Follow-ups

The platform-level unification work (owner-scoped subscriptions, unified
command registry, single realtime topology, `fetchWithAuth` 401 trap,
shared file-op path validation, transactional plugin load, etc.) is
**complete**, and the call-site audit across all 44 apps and 13 features
has been applied. The platform is the source of truth; this file just
tracks the small handful of items that were deliberately deferred so
they don't get lost.

Nothing here is urgent. The platform works today.

---

## Open items

### F1. Delete `core/CommandBus.js`

**Status:** 🟡 partial — call-site migration ✅; file deletion ⏳.

Every script-engine call site (`Interpreter` visitors, the 7 builtin call
sites across `MediaBuiltins`, `MultimediaBuiltins`, `SystemBuiltins`) and
every app already routes through `EventBus.executeCommand(...)`. The
`CommandBus.js` file itself still exists because it owns:

1. Timer + macro lifecycle state (`this.timers`, `this.macros`,
   `this.isRecording`) that hasn't been relocated.
2. The boot-time registrations for `command:fs:*`, `command:window:*`,
   `command:terminal:*`, `command:app:*`, `command:dialog:*`, etc. —
   `CommandBus.initialize()` is what wires those up.

Deletion just needs those moved into a non-deprecated home (likely
`core/CommandRegistry.js` or directly into `SemanticEventBus`). Cosmetic
— behaviour is already unified.

### F2. Bidirectional desktop-icon sync

`StateManager.reconcileIconsFromFileSystem(FileSystemManager)` already
runs FS → state at boot, so a `.lnk` added in session N shows up on the
desktop in session N+1. The reverse runtime direction is still
state → FS via `syncDesktopIcons`. A small follow-up could subscribe to
`filesystem:directory:changed` for `Desktop/` and re-run reconciliation
live (with a `source` check to avoid feedback loops with
`syncDesktopIcons`).

### F3. Pre-login storage drift

`index.js` notes that writes happening before login resolves go to
global storage and get overwritten when the user scope is set. The
simplest fix is to defer all storage writes until after login, or queue
them and replay into the user scope on `user:login`. Low-impact: only
affects the very narrow window between boot and login completion.

---

## Skipped items (deliberate non-decisions)

### `core/EventBus.js` re-export

`core/EventBus.js` is a one-line re-export of `SemanticEventBus`.
Removing it would force ~75 imports to change `from './EventBus.js'`
to `from './SemanticEventBus.js'` for zero functional benefit. Decision:
leave as-is.

### Path-allowlist parity between client and server

The client-side allowlist in `core/script/utils/PathValidation.js` is
unified across script + SSE + `command:fs:*` surfaces. The server-side
allowlist lives in `backend/controllers/FileController.php` and applies
to a *different* namespace (server-stored paths, not the virtual FS).
Unifying them would require a shared schema across runtimes — out of
scope for the JS architecture work.

### CSS unification

53 CSS files with import-order requirements is a real fragility surface,
but it's orthogonal to the JS architecture work. Spin up a sibling
roadmap if/when it matters.
