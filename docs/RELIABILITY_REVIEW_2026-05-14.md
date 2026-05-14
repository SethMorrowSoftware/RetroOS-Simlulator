# Reliability Review — 2026-05-14

## Scope reviewed

This review covered the repository's architecture docs, developer docs, and all major runtime surfaces:

- Core runtime (`core/`), app/feature/plugin layers (`apps/`, `features/`, `plugins/`), UI renderers (`ui/`), and boot flow (`index.js`).
- Backend/API/websocket surfaces (`api/`, `backend/`, `websocket/`).
- Existing architecture and migration documentation (`docs/ARCHITECTURE_AUDIT.md`, `docs/UNIFIED_ROADMAP.md`, `docs/MIGRATION_ROADMAP.md`, `README.md`, `DEVELOPER_GUIDE.md`, `SCRIPTING_GUIDE.md`).

## Validation run

- `bash scripts/test-retroscript.sh` → **42/42 passing**.
- `find . -name '*.php' -print0 | xargs -0 -n1 php -l` → **all PHP files parse cleanly**.

## Executive conclusion

**The unification work is substantial and meaningful, but the reliability gap is not fully closed yet.**

From the project's own roadmap/audit artifacts, platform unification is largely complete; however, remaining migration/debt items still affect robustness, consistency, and operational safety for production usage. This means the system is **much stronger than earlier baselines**, but not yet at a "fully closed" reliability posture.

## What is clearly improved

Based on current docs and code organization, major systemic hardening has landed:

- Session lifecycle centralization, state reset and teardown sequencing.
- Event/command convergence onto `SemanticEventBus` semantics.
- Shared script/file path validation model.
- WebSocket subprotocol token strategy and removal of URL-token legacy path.
- Feature/plugin lifecycle hardening and transactional plugin load semantics.

## Remaining reliability blockers (must-close)

These are the top items still preventing a "closed gap" declaration:

1. **Call-site migration completeness**
   - The project explicitly indicates that core platform unification is done but call-site migration is still tracked in `docs/MIGRATION_ROADMAP.md`.
   - Reliability risk: old and new patterns can coexist, increasing drift and regressions under maintenance.

2. **Event schema coverage and enforcement depth**
   - Dynamic/app-scoped events and partial schema validation coverage are called out historically as a weakness.
   - Reliability risk: malformed payloads and silent integration bugs.

3. **Sanitization/XSS enforcement at app rendering boundaries**
   - InnerHTML-based rendering patterns still depend on contributor discipline.
   - Reliability risk: security and stability exposure from unsafe payload rendering.

4. **Conflict semantics for multiplayer and collaborative state**
   - Last-write-wins behavior remains a documented tradeoff.
   - Reliability risk: race overwrites and hard-to-debug state divergence under concurrent usage.

5. **Operational observability completion**
   - Some failure channels remain warning/log-driven rather than strongly surfaced as health/fault domains.
   - Reliability risk: degraded MTTR, difficult root-cause analysis in production.

## Recommended acceptance gate (before declaring "robust")

Adopt a release gate that requires all of the following:

- Zero open P0/P1 items in `docs/MIGRATION_ROADMAP.md`.
- Event schema coverage target (e.g., >=95% of emitted events validated in CI).
- No known unsanitized `innerHTML` paths in shipped apps/features.
- Concurrency test coverage for multiplayer/narrative conflict scenarios.
- CI health checks for frontend script tests + PHP lint + documented smoke flows.

## Short answer to the stakeholder question

- **Has unification meaningfully closed most of the foundational gap?** Yes.
- **Is the gap fully closed such that reliability is now robust across the board?** Not yet.
