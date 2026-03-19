import { BrowserWindow, BrowserView, Utils } from "electrobun/bun";
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
import { readFileSync, writeFileSync, mkdirSync } from "fs";

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

// --- Recent directories ---

const RECENT_DIRS_PATH = join(homedir(), ".config", "terminal-commander", "recent-dirs.json");
const MAX_RECENT_DIRS = 10;

function loadRecentDirs(): string[] {
	try {
		const content = readFileSync(RECENT_DIRS_PATH, "utf-8");
		const dirs = JSON.parse(content);
		return Array.isArray(dirs) ? dirs.slice(0, MAX_RECENT_DIRS) : [];
	} catch {
		return [];
	}
}

function saveRecentDirs(dirs: string[]): void {
	const configDir = join(homedir(), ".config", "terminal-commander");
	try {
		mkdirSync(configDir, { recursive: true });
	} catch { /* already exists */ }
	writeFileSync(RECENT_DIRS_PATH, JSON.stringify(dirs, null, 2));
}

function addRecentDir(dir: string): void {
	const dirs = loadRecentDirs().filter((d) => d !== dir);
	dirs.unshift(dir);
	saveRecentDirs(dirs.slice(0, MAX_RECENT_DIRS));
}

// --- Title tracking + bell debounce ---

const titleById = new Map<string, string>();
const bellDebounce = new Map<string, ReturnType<typeof setTimeout>>();

function clearBellDebounce(id: string): void {
	const timer = bellDebounce.get(id);
	if (timer !== undefined) {
		clearTimeout(timer);
		bellDebounce.delete(id);
	}
}

// --- PTY Manager ---

let mainWindow: BrowserWindow;

const ptyManager = new PtyManager({
	onOutput: (id, data) => {
		mainWindow.webview.rpc.send.terminalOutput({ id, data });
	},
	onTitle: (id, title) => {
		titleById.set(id, title);
		mainWindow.webview.rpc.send.terminalTitle({ id, title });
	},
	onBell: (id) => {
		mainWindow.webview.rpc.send.terminalBell({ id });

		// Debounce notifications (500ms)
		clearBellDebounce(id);
		bellDebounce.set(
			id,
			setTimeout(() => {
				bellDebounce.delete(id);
				Utils.showNotification({
					title: titleById.get(id) || "Terminal",
					body: "Task completed",
					silent: false,
				});
			}, 500),
		);
	},
	onExit: (id, exitCode) => {
		mainWindow.webview.rpc.send.terminalExit({ id, exitCode });
		Utils.showNotification({
			title: titleById.get(id) || "Terminal",
			body: `Process exited with code ${exitCode}`,
			silent: true,
		});
		titleById.delete(id);
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

			closeTerminal: ({ id }) => {
				titleById.delete(id);
				clearBellDebounce(id);
				return { success: ptyManager.close(id) };
			},

			browseDirectory: async ({ startingFolder }) => {
				const results = await Utils.openFileDialog({
					startingFolder: startingFolder || homedir(),
					canChooseFiles: false,
					canChooseDirectory: true,
					allowsMultipleSelection: false,
				});
				const path = results.length > 0 ? results[0] : null;
				return { path };
			},

			getRecentDirs: () => {
				return { dirs: loadRecentDirs() };
			},

			saveRecentDir: ({ dir }) => {
				addRecentDir(dir);
				return { success: true };
			},
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
