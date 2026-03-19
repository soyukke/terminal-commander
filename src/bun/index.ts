import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { TerminalRPCType } from "../shared/types.ts";
import {
	DEFAULT_CONFIG,
	parseConfigFile,
	resolveConfig,
	type AppConfig,
} from "../shared/config.ts";
import { PtyManager } from "./ptyManager.ts";
import { join } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";

// --- Load config ---

function loadConfig(): AppConfig {
	const configPaths = [
		join(homedir(), ".config", "terminal-commander", "config"),
		join(homedir(), ".terminal-commander.conf"),
	];

	for (const configPath of configPaths) {
		try {
			const content = readFileSync(configPath, "utf-8");
			const userConfig = parseConfigFile(content);
			console.log(`Config loaded from: ${configPath}`);
			return resolveConfig(userConfig);
		} catch {
			// File not found, try next
		}
	}

	console.log("No config file found, using defaults");
	return DEFAULT_CONFIG;
}

const config = loadConfig();

// --- PTY Manager ---

let mainWindow: BrowserWindow;

const ptyManager = new PtyManager({
	onOutput: (id, data) => {
		mainWindow.webview.rpc.send.terminalOutput({ id, data });
	},
	onExit: (id, exitCode) => {
		mainWindow.webview.rpc.send.terminalExit({ id, exitCode });
	},
});

// --- RPC ---

const terminalRPC = BrowserView.defineRPC<TerminalRPCType>({
	maxRequestTime: 10000,
	handlers: {
		requests: {
			getConfig: () => ({ config }),

			createTerminal: ({ cols, rows, command, cwd }) => {
				const id = ptyManager.create(cols, rows, {
					command,
					cwd: cwd || config["working-directory"] || undefined,
					env: config.env,
				});
				return { id };
			},

			closeTerminal: ({ id }) => ({
				success: ptyManager.close(id),
			}),
		},
		messages: {
			writeToTerminal: ({ id, data }) => {
				ptyManager.write(id, data);
			},
			resizeTerminal: ({ id, cols, rows }) => {
				ptyManager.resize(id, cols, rows);
			},
		},
	},
});

// --- Window ---

mainWindow = new BrowserWindow({
	title: "Terminal Commander",
	url: "views://mainview/index.html",
	frame: {
		width: config["window-width"],
		height: config["window-height"],
		x: 100,
		y: 100,
	},
	rpc: terminalRPC,
});

console.log("Terminal Commander started!");
