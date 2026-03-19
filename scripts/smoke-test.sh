#!/usr/bin/env bash
# Smoke test: build, launch, verify startup, then kill.
set -euo pipefail

TIMEOUT=30
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG=$(mktemp)

cleanup() {
  echo "==> Cleaning up..."
  # Kill the bun start process
  kill "$PID" 2>/dev/null || true
  # Kill all electrobun-related processes spawned by it
  pkill -f "electrobun dev" 2>/dev/null || true
  pkill -f "electrobun build" 2>/dev/null || true
  pkill -f "Terminal Commander" 2>/dev/null || true
  pkill -f "TerminalCommander" 2>/dev/null || true
  # Wait for processes to exit
  sleep 1
  # Verify nothing is left
  if pgrep -f "electrobun" >/dev/null 2>&1; then
    pkill -9 -f "electrobun" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT

echo "==> Building and launching Terminal Commander..."
cd "$APP_DIR"
bun start > "$LOG" 2>&1 &
PID=$!

# Wait for startup message
echo "==> Waiting for app to start (timeout: ${TIMEOUT}s)..."
ELAPSED=0
while ! grep -q "Terminal Commander started!" "$LOG" 2>/dev/null; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ $ELAPSED -ge $TIMEOUT ]; then
    echo "FAIL: App did not start within ${TIMEOUT}s"
    echo "--- Log ---"
    cat "$LOG"
    exit 1
  fi
done

echo "==> App started successfully!"

# Check for fatal errors in log
if grep -qi "panic\|crash\|unhandled" "$LOG"; then
  echo "FAIL: Fatal errors detected in log"
  echo "--- Log ---"
  cat "$LOG"
  exit 1
fi

# Let it run briefly to ensure no immediate crash
sleep 2

if ! kill -0 "$PID" 2>/dev/null; then
  echo "FAIL: App crashed shortly after startup"
  echo "--- Log ---"
  cat "$LOG"
  exit 1
fi

echo "==> Smoke test PASSED"
exit 0
