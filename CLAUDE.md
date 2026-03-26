# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Terminal Commander は Electrobun (Bun + TypeScript) ベースのターミナルマルチプレクサー。Claude Code マルチエージェントワークフロー向け。

## Commands

| タスク | コマンド |
|---|---|
| 開発起動 | `bun start` |
| ファイル監視付き起動 | `bun run dev` |
| Inspector 有効で起動 | `TC_INSPECTOR_PORT=9274 bun start` |
| ユニットテスト全体 | `bun test src/` |
| 単一テスト | `bun test src/shared/config.test.ts` |
| E2E テスト | `bash scripts/e2e-test.sh` |
| スモークテスト | `bash scripts/smoke-test.sh` |
| ビルド | `just build` |
| インストール | `just install` |

## Architecture

### プロセス構成

```
Bun Process (backend)          WebView (frontend)
  src/bun/                       src/mainview/
  ├── index.ts                   ├── index.ts
  ├── ptyManager.ts              ├── tileState.ts
  ├── ptyParser.ts               ├── tileDOM.ts
  └── inspector.ts               ├── layout.ts
                                 └── keybindings.ts
        ↕ Electrobun RPC (TerminalRPCType)
```

### RPC 通信パターン

Backend と Frontend は **Electrobun RPC** で通信する。スキーマは `src/shared/types.ts` の `TerminalRPCType` で一元定義。

- **Requests** (req-response): `rpc.request.*()` — createTerminal, getConfig, saveSession 等
- **Messages** (fire-and-forget): `rpc.send.*()` — terminalOutput, writeToTerminal 等

Backend 側: `BrowserView.defineRPC<TerminalRPCType>()`
Frontend 側: `Electroview.defineRPC<TerminalRPCType>()`

### PTY 管理

`PtyManager` (`src/bun/ptyManager.ts`) が PTY プロセスのライフサイクルを管理。
- ターミナル ID は `term-0`, `term-1` と自動採番
- PTY 出力は `ptyParser.ts` のステートマシンで ESC シーケンスをパース（OSC タイトル、OSC 7 cwd、BEL）
- リングバッファ (100KB) で最近の出力を保持（Inspector 用）

### タイル管理

- `tileState.ts`: タイルの状態管理（Map + 順序配列）
- `layout.ts`: `bestGrid()` (`src/shared/gridCalc.ts`) で最適なグリッド配置を計算し CSS Grid で配置
- `tileDOM.ts`: タイルの DOM 生成

### Inspector プロトコル (E2E テスト用)

`src/bun/inspector.ts` — 改行区切り JSON over TCP (デフォルト port 9274)。
E2E テスト (`src/e2e/test_app.py`, 純粋 Python) がこのプロトコルで UI を操作する。
カスタムメソッド: `write_to_terminal`, `get_terminal_output`, `create_tile`, `close_tile`, `list_terminals`, `send_to_terminal`

### MCP サーバー

`src/mcp/server.ts` — Inspector TCP 経由で Terminal Commander を操作する MCP サーバー。
ツール: `list_panes`, `read_pane_output`, `send_to_pane`。
ペイン間の Claude Code 連携（マルチエージェント）に使用。

### 設定

Ghostty 風 INI 形式 (`key = value`)。読み込み順:
1. `~/.config/terminal-commander/config`
2. `~/.terminal-commander.conf`
3. デフォルト値

繰り返しキー (`env`, `palette`, `keybind`) は `key = subkey=value` 構文。

### セッション永続化

タイル構成は `~/.config/terminal-commander/session.json` に自動保存（200ms デバウンス）。起動時に復元。

## Testing

- フレームワーク: `bun:test`
- テストファイル: ソースと同ディレクトリに `<name>.test.ts`
- 純粋ロジックは DOM なしでテスト。mainview コードは xterm/DOM をモック
- E2E: Inspector TCP 経由。設定に `inspector-port = 9274` が必要

## Code Style

- TypeScript strict
- タブインデント
- セミコロンあり
- 外部依存は最小限 (electrobun のみ)
