# IlluminatOS! Known Follow-ups

The platform-level unification work (owner-scoped subscriptions, unified
command registry, single realtime topology, `fetchWithAuth` 401 trap,
shared file-op path validation, transactional plugin load, etc.) is
**complete**, and the call-site audit across all 44 apps and 13 features
has been applied. The platform is the source of truth.

The three previously-deferred follow-ups (F1 — `CommandBus.js` deletion,
F2 — bidirectional desktop-icon sync, F3 — pre-login storage drift) are
**closed**. See `CLAUDE.md` for current platform docs.

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
