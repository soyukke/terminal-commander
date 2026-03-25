---
name: add-test
description: Generate tests for a source file. Creates unit tests (bun:test) or E2E tests (Inspector protocol) depending on the target. Use when test coverage needs to be expanded.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(bun test*), Bash(bash scripts/*), Bash(lsof*), Bash(pkill*), Bash(python3*)
---

# Add Tests

Generate tests for a given source file or feature.

## Decide which type

- **Pure logic** (gridCalc, tileOrder, config, ptyParser, keybindings) → unit test (`bun:test`)
- **Backend integration** (PtyManager lifecycle, RPC handlers) → unit test with PtyManager
- **Full app behavior** (tile creation in UI, Inspector visibility, PTY I/O through the app) → E2E test (add to `src/e2e/test_app.py`)

## Unit test conventions

- Framework: `bun:test` (`describe`, `test`, `expect`)
- Location: same directory as source, named `<source>.test.ts`
- Read an existing `.test.ts` nearby for style reference
- Focus on pure logic. Mock DOM/xterm for mainview code.

## E2E test conventions

- File: `src/e2e/test_app.py`
- Client: `InspectorClient` (pure socket, no external deps)
- Always call `c.wait_until_ready()` before assertions
- Register new tests in the `tests` list at bottom of file
- Custom methods available: `write_to_terminal`, `get_terminal_output`, `create_tile`, `close_tile`

## Steps

1. If no file specified, ask what to test
2. Read the source file
3. Choose unit test or E2E test
4. Write the tests
5. Run and verify:
   - Unit: `bun test <test-file>`
   - E2E: `bash scripts/e2e-test.sh`
6. Fix failures and re-run
