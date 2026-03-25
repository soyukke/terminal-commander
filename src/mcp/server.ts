/**
 * Terminal Commander MCP Server
 *
 * Claude Code の MCP クライアントから呼び出され、
 * Inspector プロトコル (TCP) 経由で他ペインの Claude Code にメッセージを送信する。
 *
 * 使い方:
 *   node dist/mcp-server.js [--port 9274]
 *
 * Claude Code (~/.claude.json):
 *   { "mcpServers": { "terminal-commander": { "type": "stdio", "command": "node", "args": ["dist/mcp-server.js"] } } }
 */

// ================================================================
// Inspector TCP Client
// ================================================================

const INSPECTOR_PORT = parseInt(
	process.argv.find((_, i, a) => a[i - 1] === "--port") || "9274",
	10,
);

let requestId = 0;

async function inspectorCall(
	method: string,
	params: Record<string, any> = {},
): Promise<any> {
	const id = ++requestId;
	const msg = JSON.stringify({ id, method, ...params }) + "\n";

	return new Promise((resolve, reject) => {
		const socket = require("net").createConnection(
			{ host: "127.0.0.1", port: INSPECTOR_PORT },
			() => {
				socket.write(msg);
			},
		);

		let buf = "";
		socket.on("data", (data: Buffer) => {
			buf += data.toString();
			const nl = buf.indexOf("\n");
			if (nl !== -1) {
				const line = buf.slice(0, nl);
				socket.destroy();
				try {
					resolve(JSON.parse(line));
				} catch {
					reject(new Error("invalid JSON from Inspector"));
				}
			}
		});

		socket.on("error", (err: Error) => {
			reject(
				new Error(
					`Inspector connection failed (port ${INSPECTOR_PORT}): ${err.message}`,
				),
			);
		});

		socket.setTimeout(5000, () => {
			socket.destroy();
			reject(new Error("Inspector request timed out"));
		});
	});
}

// ================================================================
// MCP Protocol (JSON-RPC 2.0 over stdio, newline-delimited JSON)
// ================================================================

const TOOLS = [
	{
		name: "send_to_pane",
		description:
			"他のペインで動作中の Claude Code にメッセージを送信する。メッセージはそのペインのテキスト入力に書き込まれ、Enter で送信される。",
		inputSchema: {
			type: "object" as const,
			properties: {
				terminal_id: {
					type: "string",
					description:
						'送信先のターミナル ID (例: "term-0")。list_panes で確認可能。',
				},
				message: {
					type: "string",
					description: "送信するメッセージテキスト",
				},
			},
			required: ["terminal_id", "message"],
		},
	},
	{
		name: "list_panes",
		description:
			"Terminal Commander で現在開いている全ペイン（ターミナル）の一覧を取得する。各ペインの terminal_id、名前、ステータスが返される。",
		inputSchema: {
			type: "object" as const,
			properties: {},
		},
	},
	{
		name: "read_pane_output",
		description:
			"指定したペインの最近のターミナル出力を取得する。他ペインの Claude Code が何をしているか確認するのに使う。",
		inputSchema: {
			type: "object" as const,
			properties: {
				terminal_id: {
					type: "string",
					description: '読み取るターミナル ID (例: "term-0")',
				},
				last_n_chars: {
					type: "number",
					description:
						"取得する末尾の文字数 (デフォルト: 4000)",
				},
			},
			required: ["terminal_id"],
		},
	},
];

function makeResponse(id: number | string | null, result: any): any {
	return { jsonrpc: "2.0", id, result };
}

function makeError(
	id: number | string | null,
	code: number,
	message: string,
): any {
	return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRequest(msg: any): Promise<any> {
	const { id, method, params } = msg;

	switch (method) {
		case "initialize":
			return makeResponse(id, {
				protocolVersion: "2024-11-05",
				capabilities: { tools: {} },
				serverInfo: {
					name: "terminal-commander",
					version: "0.1.0",
				},
			});

		case "notifications/initialized":
			return null; // notification, no response

		case "tools/list":
			return makeResponse(id, { tools: TOOLS });

		case "tools/call":
			return handleToolCall(id, params);

		case "ping":
			return makeResponse(id, {});

		default:
			return makeError(id, -32601, `Unknown method: ${method}`);
	}
}

async function handleToolCall(
	id: number | string | null,
	params: any,
): Promise<any> {
	const { name, arguments: args } = params;

	try {
		switch (name) {
			case "send_to_pane": {
				const result = await inspectorCall("send_to_terminal", {
					terminal_id: args.terminal_id,
					message: args.message,
				});
				if (result.error) {
					return makeResponse(id, {
						content: [
							{
								type: "text",
								text: `Error: ${result.error}`,
							},
						],
						isError: true,
					});
				}
				return makeResponse(id, {
					content: [
						{
							type: "text",
							text: `メッセージを ${args.terminal_id} に送信しました。`,
						},
					],
				});
			}

			case "list_panes": {
				const result = await inspectorCall("list_terminals");
				if (result.error) {
					return makeResponse(id, {
						content: [
							{
								type: "text",
								text: `Error: ${result.error}`,
							},
						],
						isError: true,
					});
				}
				return makeResponse(id, {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								result.terminals,
								null,
								2,
							),
						},
					],
				});
			}

			case "read_pane_output": {
				const result = await inspectorCall("get_terminal_output", {
					terminal_id: args.terminal_id,
				});
				if (result.error) {
					return makeResponse(id, {
						content: [
							{
								type: "text",
								text: `Error: ${result.error}`,
							},
						],
						isError: true,
					});
				}
				const text = result.text || "";
				const limit = args.last_n_chars || 4000;
				return makeResponse(id, {
					content: [
						{
							type: "text",
							text: text.slice(-limit),
						},
					],
				});
			}

			default:
				return makeError(
					id,
					-32601,
					`Unknown tool: ${name}`,
				);
		}
	} catch (e: any) {
		return makeResponse(id, {
			content: [{ type: "text", text: `Error: ${e.message}` }],
			isError: true,
		});
	}
}

// ================================================================
// stdio transport (newline-delimited JSON)
// ================================================================

const fs = require("fs");
const readline = require("readline");

function sendMessage(msg: any): void {
	const json = JSON.stringify(msg);
	fs.writeSync(1, json + "\n");
}

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line: string) => {
	if (!line.trim()) return;
	let msg: any;
	try {
		msg = JSON.parse(line);
	} catch {
		return;
	}
	handleRequest(msg).then((response) => {
		if (response !== null && response !== undefined) {
			sendMessage(response);
		}
	});
});

rl.on("close", () => {
	process.exit(0);
});

// Prevent unhandled rejection crashes
process.on("unhandledRejection", (err) => {
	fs.writeSync(2, `[tc-mcp] unhandled rejection: ${err}\n`);
});
