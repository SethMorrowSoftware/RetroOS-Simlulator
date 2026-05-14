#!/usr/bin/env bash
# lint-innerhtml.sh - Detect innerHTML assignments that may lack escaping.
#
# This script scans JavaScript files in admin/ and core/ for innerHTML usage
# and flags any files that use innerHTML without importing a sanitize module.
#
# Exit codes:
#   0 - All innerHTML usages are in files that import sanitize utilities
#   1 - Found innerHTML in files missing sanitize imports
#
# Usage:
#   bash scripts/lint-innerhtml.sh          # scan default directories
#   bash scripts/lint-innerhtml.sh src/     # scan a specific directory

set -euo pipefail

SCAN_DIRS=("${@:-admin/ core/ ui/ apps/ features/}")
FAILED=0

# Files that use innerHTML must import from a sanitize module.
# Static-only innerHTML (no interpolation) is allowed but should still
# have the import available as a guardrail for future edits.
for file in $(grep -rl '\.innerHTML\s*=' "${SCAN_DIRS[@]}" --include='*.js' 2>/dev/null || true); do
    # Check if the file imports escHtml / escapeHtml / sanitize
    if ! grep -qE "(from\s+['\"].*sanitize|escHtml|escapeHtml|escAttr)" "$file"; then
        echo "WARN: $file uses innerHTML without importing sanitize utilities"
        FAILED=1
    fi
done

if [ "$FAILED" -eq 0 ]; then
    echo "OK: All innerHTML usages are covered by sanitize imports."
fi

exit $FAILED
