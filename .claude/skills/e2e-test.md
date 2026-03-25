---
name: e2e-test
description: Run E2E tests via playheavy Inspector protocol. Launches the real app, connects over TCP:9274, tests tile lifecycle/PTY I/O/events, then cleans up. Use when you need to verify the app works end-to-end after code changes.
allowed-tools: Bash(bash scripts/*), Bash(lsof*), Bash(pkill*), Bash(pgrep*), Bash(sleep*), Bash(kill*), Bash(python3*), Read, Edit, Grep, Glob
---

# E2E Test Runner (playheavy Inspector)

Run the full E2E test suite. The script handles app lifecycle automatically.

## Run

```bash
bash scripts/e2e-test.sh
```

If port 9274 is already in use:
```bash
lsof -i :9274 -t | xargs kill -9 2>/dev/null
sleep 1
bash scripts/e2e-test.sh
```

## What it does

1. Kills any existing Terminal Commander processes
2. Starts the app (`bun start`) — Inspector starts on TCP:9274 via config
3. Waits for `[Inspector] listening` in log output
4. Runs `python3 src/e2e/test_app.py`
5. Reports results and cleans up all processes

## Test cases (src/e2e/test_app.py)

| Test | Verifies |
|---|---|
| `test_ping` | Inspector TCP connection |
| `test_health_and_ready` | App initialization complete (health protocol) |
| `test_list_elements` | Element listing |
| `test_find_all_tiles` | Tile search by role |
| `test_tile_has_properties` | Custom properties (terminal_id, status, cwd) |
| `test_write_and_read_output` | PTY write + output buffer read |
| `test_create_and_close_tile` | Tile creation/deletion via WebView RPC |
| `test_subscribe_element_added` | Event subscription and push |
| `test_screenshot` | Screenshot capture (skips if no permission) |

## Prerequisites

- `inspector-port = 9274` in `~/.config/terminal-commander/config`
- Python 3 available
- No external Python packages required (pure socket client)

## If tests fail

- Read the failure message in the output
- Check if the app started (look for startup log)
- Check if Inspector is listening (`lsof -i :9274`)
- For element count issues: the `health` protocol waits for `ready:true` — check `inspector.setReady()` in `src/bun/index.ts`
- For RPC issues: check `src/shared/types.ts` matches both bun and mainview handlers

## Adding new E2E tests

Add test functions to `src/e2e/test_app.py`. Use `InspectorClient`:

```python
def test_my_feature():
    with InspectorClient() as c:
        c.wait_until_ready()
        # Use c.send("method", ...) to call Inspector methods
        # Use c.send("custom_method", ...) for app-specific methods
```

Register the test in the `tests` list at the bottom of the file.
