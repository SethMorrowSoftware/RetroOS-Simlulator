#!/usr/bin/env bash
# RetroScript test harness wrapper.
#
# Verifies that the RetroScript engine implements the surface documented
# in SCRIPTING_GUIDE.md. Runs the Node-based test suite which:
#   * Parses every documented syntax form (try/catch, on/emit, foreach,
#     match, def/call, declarative autoexec patterns).
#   * Executes a DOM-free subset of builtins (math, string, array, json,
#     type, time) end-to-end.
#   * Verifies try/catch binds errors as documented.
#   * Verifies `on event` handlers persist past script end and fire on
#     subsequent emits.
#   * Confirms every builtin module registers a non-zero number of
#     functions and that browser-dependent modules at least load.
#   * Re-parses autoexec.retro to catch syntax regressions.
#
# Usage:  bash scripts/test-retroscript.sh

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is required to run the RetroScript test harness." >&2
    exit 1
fi

exec node scripts/test-retroscript.mjs "$@"
