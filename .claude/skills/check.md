---
name: check
description: Run all quality checks in order - unit tests, integration tests, and E2E tests. Reports results without fixing. Use before committing or to get an overview of project health.
allowed-tools: Bash(bun*), Bash(bash scripts/*), Bash(lsof*), Bash(pkill*), Bash(pgrep*), Bash(sleep*), Bash(kill*), Bash(python3*), Read, Grep, Glob
---

# Full Quality Check

Run all test layers in order. Report results. Do NOT fix anything.

## Steps

1. **Unit tests**: `bun test src/`
2. **E2E tests**: `bash scripts/e2e-test.sh`
   - If port 9274 is in use: `lsof -i :9274 -t | xargs kill -9 2>/dev/null; sleep 1`

## Report Format

```
[PASS] Unit tests (N tests, Nms)
[PASS] E2E tests (N passed, M failed)
```

or

```
[PASS] Unit tests (77 tests, 120ms)
[FAIL] E2E tests — test_write_and_read_output: Marker not found in output
```

Do NOT attempt to fix issues. Only report what failed and why.
