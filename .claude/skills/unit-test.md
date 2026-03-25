---
name: unit-test
description: Run bun unit tests, show failures, and fix them. Use after code changes to verify unit-level correctness.
allowed-tools: Bash(bun test*), Read, Edit, Grep, Glob
---

# Unit Test Runner

Run unit tests and fix failures.

## Run

```bash
bun test src/
```

## On failure

1. Read the failing test file and the source it tests
2. Determine root cause: did the source change break the test, or is the test wrong?
3. Fix the issue
4. Re-run `bun test src/`
5. Repeat until all pass

## On success

Report the summary: pass count and duration.
