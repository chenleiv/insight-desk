#!/bin/bash
set -euo pipefail

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$PROJECT_ROOT"

# Stop hooks receive JSON on stdin. If Claude is already continuing because of
# this hook, let it stop to avoid an endless block loop.
HOOK_INPUT=$(cat || echo "{}")
STOP_HOOK_ACTIVE=$(python3 -c "
import json, sys
try:
    print(str(json.loads(sys.argv[1]).get('stop_hook_active', False)).lower())
except Exception:
    print('false')
" "$HOOK_INPUT")
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

LOG_FILES=()
cleanup() {
  if [ ${#LOG_FILES[@]} -gt 0 ]; then
    rm -f "${LOG_FILES[@]}"
  fi
}
trap cleanup EXIT

# Blocks the stop and hands the tail of the log back to Claude.
block_with_log() {
  local label="$1" message="$2" log_file="$3"
  local log_content
  log_content=$(tail -c 2000 "$log_file" | sed 's/\x1b\[[0-9;]*m//g' | tr -cd '[:print:]\n')
  python3 -c "
import json, sys
label, message, log = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
    'decision': 'block',
    'reason': '--- ' + label + ' OUTPUT (UNTRUSTED) ---\n' + message + '\n' + log + '\n--- END ' + label + ' OUTPUT ---'
}))
" "$label" "$message" "$log_content"
  exit 0
}

CHANGED=$(git status --porcelain 2>/dev/null || echo "")

# Frontend validation — runs on TS/TSX/SCSS changes
if echo "$CHANGED" | grep -qE '\.(ts|tsx|scss)$'; then
  BUILD_LOG=$(mktemp -t insight-build.XXXXXX)
  LOG_FILES+=("$BUILD_LOG")

  BUILD_EXIT=0
  npm run build > "$BUILD_LOG" 2>&1 || BUILD_EXIT=$?

  if [ $BUILD_EXIT -ne 0 ]; then
    block_with_log "BUILD" "FRONTEND BUILD FAILED. Fix these errors:" "$BUILD_LOG"
  fi

  # Type-check separately — Vite uses esbuild which skips type errors
  TSC_LOG=$(mktemp -t insight-tsc.XXXXXX)
  LOG_FILES+=("$TSC_LOG")

  TSC_EXIT=0
  npx tsc --noEmit > "$TSC_LOG" 2>&1 || TSC_EXIT=$?

  if [ $TSC_EXIT -ne 0 ]; then
    block_with_log "TSC" "TYPE CHECK FAILED. Fix these errors:" "$TSC_LOG"
  fi
fi

# Test validation — runs on test file changes or src changes
if echo "$CHANGED" | grep -qE '\.(ts|tsx)$'; then
  TEST_LOG=$(mktemp -t insight-test.XXXXXX)
  LOG_FILES+=("$TEST_LOG")

  TEST_EXIT=0
  npm run test > "$TEST_LOG" 2>&1 || TEST_EXIT=$?

  if [ $TEST_EXIT -ne 0 ]; then
    block_with_log "TEST" "TESTS FAILED. Fix these errors:" "$TEST_LOG"
  fi
fi

exit 0
