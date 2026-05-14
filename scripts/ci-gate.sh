#!/usr/bin/env bash
# ci-gate.sh — Aggregated acceptance gate for the reliability review.
#
# Runs every cheap static + smoke check the review depends on. Used by CI
# and by the manual smoke checklist in docs/MIGRATION_ROADMAP.md.
#
# Gates (each must pass):
#   1. node --check on all .js files in core/ apps/ features/ ui/ index.js
#   2. php -l on every .php file (excludes backups/, vendor/)
#   3. bash scripts/lint-innerhtml.sh
#   4. bash scripts/test-retroscript.sh
#   5. node scripts/check-event-schema-coverage.mjs

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

fail=0
section() { printf '\n=== %s ===\n' "$1"; }
report() {
    local name="$1" rc="$2"
    if [ "$rc" -eq 0 ]; then printf 'PASS  %s\n' "$name"
    else printf 'FAIL  %s (exit %s)\n' "$name" "$rc"; fail=1
    fi
}

section "1/5 JS syntax (node --check)"
js_failed=0
while IFS= read -r -d '' f; do
    if ! node --check "$f" >/dev/null 2>&1; then
        echo "  syntax error: $f"
        js_failed=1
    fi
done < <(find core apps features ui -name '*.js' -not -path '*/node_modules/*' -print0; printf 'index.js\0')
report "JS syntax check" "$js_failed"

section "2/5 PHP lint"
php_failed=0
if command -v php >/dev/null 2>&1; then
    while IFS= read -r -d '' f; do
        if ! php -l "$f" >/dev/null 2>&1; then
            echo "  syntax error: $f"
            php_failed=1
        fi
    done < <(find . -name '*.php' -not -path './backups/*' -not -path './vendor/*' -not -path './node_modules/*' -print0)
else
    echo "  php not installed — skipping (run on a host with PHP)"
fi
report "PHP lint" "$php_failed"

section "3/5 innerHTML sanitize lint"
bash scripts/lint-innerhtml.sh
report "innerHTML lint" $?

section "4/5 RetroScript tests"
bash scripts/test-retroscript.sh
report "retroscript tests" $?

section "5/5 Event schema coverage"
node scripts/check-event-schema-coverage.mjs
report "schema coverage" $?

echo
if [ "$fail" -ne 0 ]; then
    echo "ci-gate: FAILED"
    exit 1
fi
echo "ci-gate: all gates passed"
