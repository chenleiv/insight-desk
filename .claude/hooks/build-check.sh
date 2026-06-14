#!/bin/bash
set -euo pipefail

PROJECT_ROOT="/Users/chenleiv/insight-desk"
cd "$PROJECT_ROOT"

CHANGED=$(git status --porcelain 2>/dev/null || echo "")

# Frontend validation — runs on TS/TSX/SCSS changes
if echo "$CHANGED" | grep -qE '\.(ts|tsx|scss)$'; then
  BUILD_LOG=$(mktemp -t insight-build.XXXXXX)
  trap 'rm -f "$BUILD_LOG"' EXIT

  npm run build > "$BUILD_LOG" 2>&1
  BUILD_EXIT=$?

  if [ $BUILD_EXIT -ne 0 ]; then
    LOG_CONTENT=$(tail -c 2000 "$BUILD_LOG" | sed 's/\x1b\[[0-9;]*m//g' | tr -cd '[:print:]\n')
    python3 -c "
import json, sys
log = sys.argv[1]
output = {
    'hookSpecificOutput': {
        'hookEventName': 'Stop',
        'additionalContext': '--- BUILD OUTPUT (UNTRUSTED) ---\nFRONTEND BUILD FAILED. Fix these errors:\n' + log + '\n--- END BUILD OUTPUT ---'
    }
}
print(json.dumps(output))
" "$LOG_CONTENT"
    exit 0
  fi
fi

# Test validation — runs on test file changes or src changes
if echo "$CHANGED" | grep -qE '\.(ts|tsx)$'; then
  TEST_LOG=$(mktemp -t insight-test.XXXXXX)
  trap 'rm -f "$TEST_LOG"' EXIT

  npm run test > "$TEST_LOG" 2>&1
  TEST_EXIT=$?

  if [ $TEST_EXIT -ne 0 ]; then
    LOG_CONTENT=$(tail -c 2000 "$TEST_LOG" | sed 's/\x1b\[[0-9;]*m//g' | tr -cd '[:print:]\n')
    python3 -c "
import json, sys
log = sys.argv[1]
output = {
    'hookSpecificOutput': {
        'hookEventName': 'Stop',
        'additionalContext': '--- TEST OUTPUT (UNTRUSTED) ---\nTESTS FAILED. Fix these errors:\n' + log + '\n--- END TEST OUTPUT ---'
    }
}
print(json.dumps(output))
" "$LOG_CONTENT"
    exit 0
  fi
fi

exit 0
