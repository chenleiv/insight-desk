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

# Runs one npm script and blocks the stop if it fails.
run_check() {
  local label="$1" message="$2" script="$3"
  local log_file exit_code=0
  # An explicit template: mktemp -t ignores TMPDIR on macOS and fails in the sandbox.
  log_file=$(mktemp "${TMPDIR:-/tmp}/insight-$script.XXXXXX")
  LOG_FILES+=("$log_file")

  npm run "$script" > "$log_file" 2>&1 || exit_code=$?

  if [ "$exit_code" -ne 0 ]; then
    block_with_log "$label" "$message" "$log_file"
  fi
}

# -uall lists files inside new folders; without it a new folder hides their extensions.
CHANGED=$(git status --porcelain -uall -- ':!*.env*' 2>/dev/null || echo "")

# Same order as CI. ESLint covers TS/TSX only (see eslint.config.js).
if echo "$CHANGED" | grep -qE '\.(ts|tsx)"?$'; then
  run_check "LINT" "LINT FAILED. Fix these errors:" lint
fi

# The backend, shared and eval code is JavaScript.
if echo "$CHANGED" | grep -qE '\.(ts|tsx|js)"?$'; then
  run_check "TEST" "TESTS FAILED. Fix these errors:" test
fi

# shared/ is imported by the frontend, so it counts as a frontend change.
if echo "$CHANGED" | grep -qE '\.(ts|tsx|scss)"?$|[ "]shared/'; then
  run_check "BUILD" "FRONTEND BUILD FAILED. Fix these errors:" build
fi

exit 0
