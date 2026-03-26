#!/usr/bin/env bash
# E2E test: start app with inspector, run playheavy tests, cleanup.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=$(mktemp)
TIMEOUT=30

cleanup() {
  echo "==> Cleaning up..."
  kill "$APP_PID" 2>/dev/null || true
  pkill -f "electrobun dev" 2>/dev/null || true
  pkill -f "electrobun build" 2>/dev/null || true
  pkill -f "Terminal Commander" 2>/dev/null || true
  pkill -f "TerminalCommander" 2>/dev/null || true
  sleep 1
  if pgrep -f "electrobun" >/dev/null 2>&1; then
    pkill -9 -f "electrobun" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

echo "==> Starting Terminal Commander with Inspector..."
cd "$APP_DIR"
bun start > "$LOG" 2>&1 &
APP_PID=$!

# Wait for inspector to be ready
echo "==> Waiting for Inspector (timeout: ${TIMEOUT}s)..."
ELAPSED=0
while ! grep -q "\[Inspector\] listening" "$LOG" 2>/dev/null; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "FAIL: Inspector did not start within ${TIMEOUT}s"
    echo "--- Log ---"
    cat "$LOG"
    exit 1
  fi
  # Check app is still alive
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "FAIL: App exited before Inspector started"
    echo "--- Log ---"
    cat "$LOG"
    exit 1
  fi
done

echo "==> Inspector ready. Running E2E tests..."

# Extract actual inspector port from log
INSPECTOR_PORT=$(grep -o '\[Inspector\] listening on 127.0.0.1:[0-9]*' "$LOG" | grep -o '[0-9]*$')
echo "==> Inspector port: $INSPECTOR_PORT"

# Run tests (no external dependencies — pure socket client)
python3 "$APP_DIR/src/e2e/test_app.py" "$INSPECTOR_PORT"
TEST_EXIT=$?

if [ $TEST_EXIT -eq 0 ]; then
  echo "==> E2E tests PASSED"
else
  echo "==> E2E tests FAILED"
fi

exit $TEST_EXIT
