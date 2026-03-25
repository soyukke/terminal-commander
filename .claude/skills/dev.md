---
name: dev
description: Implement a feature end-to-end with autonomous feedback loop. Writes code, unit tests, runs E2E tests via playheavy Inspector, fixes failures, and repeats until all tests pass. Use this when the user asks to add a feature, fix a bug, or make any code change.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(bun test*), Bash(bun run*), Bash(bash scripts/*), Bash(lsof*), Bash(pkill*), Bash(pgrep*), Bash(sleep*), Bash(kill*), Bash(python3*)
---

# Feature Development with Full Test Feedback Loop

Implement a feature autonomously: plan, code, test at every layer, fix failures, repeat until done.

## The Loop

```
1. Understand  →  2. Plan  →  3. Unit Tests  →  4. Implement
                                                      ↓
7. Done  ←  6. E2E Test  ←  5. Unit Test  ←  (fix if fail)
              ↑                                       ↓
              └──────────── fix if fail ──────────────┘
```

## Steps

### 1. Understand
Read the relevant source files. Understand the current architecture before changing anything.

### 2. Plan
State what will change and where in 2-3 sentences. If the change touches RPC types, mention both bun and mainview sides.

### 3. Write unit tests first
Define the expected behavior as tests before writing implementation code.
- Pure logic: `bun:test` in the same directory as source (`<name>.test.ts`)
- Mock DOM/xterm for mainview code
- Follow existing test style (read a nearby `.test.ts` for reference)

### 4. Implement
Write the minimal code to make the new tests pass. Keep existing tests passing.

### 5. Run unit tests
```bash
bun test src/
```
If failures: read the error, fix, re-run. Repeat until all pass.

### 6. Run E2E tests
```bash
bash scripts/e2e-test.sh
```
This launches the real app with Inspector (TCP:9274), runs Python E2E tests via playheavy protocol, and cleans up automatically.

If port 9274 is in use:
```bash
lsof -i :9274 -t | xargs kill -9 2>/dev/null; sleep 1
```

If E2E failures: read the test output, fix the issue, re-run. Common causes:
- RPC type mismatch (check `src/shared/types.ts`)
- Inspector element not registered (check `src/bun/index.ts` hooks)
- Timing issue (health check should handle this, but check `wait_until_ready`)

### 7. Done
Report what was implemented, what tests were added, and the final test results.

## Project Architecture

```
src/bun/           Backend (Bun process)
├── index.ts       Main process, RPC handlers, Inspector integration
├── ptyManager.ts  PTY lifecycle, output buffer
├── inspector.ts   playheavy Inspector protocol server (JSON over TCP)
└── *.test.ts      Backend unit/integration tests

src/mainview/      Frontend (WebView)
├── index.ts       UI logic, RPC handlers, tile management
├── tileState.ts   Tile state (pure logic, no DOM)
├── keybindings.ts Keyboard shortcut handling
└── *.test.ts      Frontend unit tests

src/shared/        Shared between bun and mainview
├── types.ts       RPC schema, shared types
├── config.ts      Config parsing, defaults
└── *.test.ts      Shared unit tests

src/e2e/           E2E tests
└── test_app.py    playheavy Inspector protocol tests

scripts/
├── smoke-test.sh  Build + launch + verify startup
└── e2e-test.sh    Full E2E: launch app → run tests → cleanup
```

## Inspector Architecture (for E2E)

```
test_app.py  ←→  TCP:9274  ←→  InspectorServer (src/bun/inspector.ts)
                  JSON\n              ↕
                              PtyManager + WebView RPC
```

- Tiles are registered as Inspector elements with properties: `terminal_id`, `status`, `cwd`
- `create_tile` / `close_tile` go through WebView RPC (real UI tiles are created)
- `write_to_terminal` / `get_terminal_output` operate on PTY directly
- `health` method: returns `ready: true` after initial tiles are loaded
- Config: `inspector-port = 9274` in `~/.config/terminal-commander/config`

## Rules

- Separate pure logic from DOM-dependent code
- New utility functions go in `src/shared/` if used by both sides
- If adding RPC methods: update `src/shared/types.ts`, implement in both bun and mainview
- If adding Inspector-visible state: register elements / update properties in `src/bun/index.ts`
- If adding E2E test cases: add to `src/e2e/test_app.py`
