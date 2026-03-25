# Terminal Commander

Electrobun (Bun + TypeScript) ベースのターミナルマルチプレクサー。Claude Code ワークフロー向け。

## Architecture

```
src/bun/           Backend (Bun process)
├── index.ts       Main process, RPC handlers, Inspector integration
├── ptyManager.ts  PTY lifecycle, output buffer
├── inspector.ts   playheavy Inspector protocol server (JSON over TCP)
└── *.test.ts      Unit/integration tests

src/mainview/      Frontend (WebView)
├── index.ts       UI logic, RPC handlers (incl. inspectorCreateTile/inspectorCloseTile)
├── tileState.ts   Tile state management
├── keybindings.ts Keyboard shortcuts
└── *.test.ts      Unit tests

src/shared/        Shared
├── types.ts       RPC schema, shared types
├── config.ts      Config parsing, defaults (incl. inspector-port)
└── *.test.ts      Unit tests

src/e2e/           E2E tests
└── test_app.py    Inspector protocol tests (pure Python socket, no deps)

scripts/
├── smoke-test.sh  Build + launch + verify startup
└── e2e-test.sh    Full E2E: launch app → Inspector tests → cleanup
```

## Commands

- `bun test src/` — ユニットテスト
- `bash scripts/e2e-test.sh` — E2E テスト (Inspector 経由、アプリ自動起動/終了)
- `bash scripts/smoke-test.sh` — スモークテスト
- `bun start` — 開発起動
- `just build` — ビルド
- `just install` — /Applications にインストール

## Testing

### テスト層

| 層 | コマンド | 対象 |
|---|---|---|
| Unit | `bun test src/` | 純粋ロジック (gridCalc, tileState, ptyParser, keybindings, config) |
| E2E | `bash scripts/e2e-test.sh` | アプリ全体 (Inspector TCP:9274 経由) |

### Unit test conventions
- フレームワーク: `bun:test`
- ファイル: ソースと同ディレクトリに `<name>.test.ts`
- 純粋ロジックはDOMなしでテスト。mainview コードはxterm/DOMをモック。

### E2E test (playheavy Inspector protocol)
- 設定: `inspector-port = 9274` in `~/.config/terminal-commander/config`
- テストファイル: `src/e2e/test_app.py` (純粋 Python socket、外部依存なし)
- Inspector カスタムメソッド: `write_to_terminal`, `get_terminal_output`, `create_tile`, `close_tile`
- `create_tile` / `close_tile` は WebView RPC 経由で実際の UI タイルを操作する

## Code Style

- TypeScript strict
- タブインデント
- セミコロンあり
- 外部依存は最小限 (electrobun のみ)
