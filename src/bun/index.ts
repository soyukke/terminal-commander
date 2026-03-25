import { BrowserWindow, BrowserView, Utils } from "electrobun/bun";
import { RPC_MAX_REQUEST_TIME, type TerminalRPCType, type SessionData, type SessionTile } from "../shared/types.ts";
import {
	DEFAULT_CONFIG,
	parseConfigFile,
	resolveConfig,
	type AppConfig,
} from "../shared/config.ts";
import { PtyManager } from "./ptyManager.ts";
import { InspectorServer } from "./inspector.ts";
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

// --- Session persistence ---

const SESSION_PATH = join(homedir(), ".config", "terminal-commander", "session.json");
const SESSION_VERSION = 1;

function loadSessionFile(): SessionData | null {
	try {
		const content = readFileSync(SESSION_PATH, "utf-8");
		const data = JSON.parse(content);
		if (data?.version === SESSION_VERSION && Array.isArray(data?.tiles)) {
			return data as SessionData;
		}
		return null;
	} catch {
		return null;
	}
}

function saveSessionFile(tiles: SessionTile[]): void {
	const configDir = join(homedir(), ".config", "terminal-commander");
	try {
		mkdirSync(configDir, { recursive: true });
	} catch { /* already exists */ }
	const data: SessionData = {
		version: SESSION_VERSION,
		savedAt: new Date().toISOString(),
		tiles,
	};
	writeFileSync(SESSION_PATH, JSON.stringify(data, null, 2));
}

// --- Inspector (playheavy E2E テスト用) ---

const inspector = new InspectorServer();
const inspectorPort = config["inspector-port"] || 0;
if (inspectorPort > 0) {
	inspector.start(inspectorPort);
}

// terminal id → inspector eid mapping
const terminalEidMap = new Map<string, number>();

// --- Title tracking + bell debounce ---

const titleById = new Map<string, string>();
const cwdById = new Map<string, string>();
const bellDebounce = new Map<string, ReturnType<typeof setTimeout>>();
const activityTimers = new Map<string, ReturnType<typeof setTimeout>>();
const terminalStatus = new Map<string, "running" | "idle">();

const IDLE_THRESHOLD_MS = 3000;

function updateTerminalStatus(id: string, status: "running" | "idle"): void {
	const prev = terminalStatus.get(id);
	if (prev === status) return;
	terminalStatus.set(id, status);
	mainWindow.webview.rpc.send.terminalStatus({ id, status });
	const eid = terminalEidMap.get(id);
	if (eid !== undefined) inspector.updateProperty(eid, "status", status);
}

const lastResetTime = new Map<string, number>();
const RESET_THROTTLE_MS = 100;

function resetIdleTimer(id: string): void {
	const now = Date.now();
	const last = lastResetTime.get(id) ?? 0;
	if (now - last < RESET_THROTTLE_MS && activityTimers.has(id)) return;
	lastResetTime.set(id, now);

	const existing = activityTimers.get(id);
	if (existing !== undefined) clearTimeout(existing);
	activityTimers.set(
		id,
		setTimeout(() => {
			activityTimers.delete(id);
			lastResetTime.delete(id);
			updateTerminalStatus(id, "idle");
		}, IDLE_THRESHOLD_MS),
	);
}

function clearBellDebounce(id: string): void {
	const timer = bellDebounce.get(id);
	if (timer !== undefined) {
		clearTimeout(timer);
		bellDebounce.delete(id);
	}
}

function clearActivityTimer(id: string): void {
	const timer = activityTimers.get(id);
	if (timer !== undefined) {
		clearTimeout(timer);
		activityTimers.delete(id);
	}
	terminalStatus.delete(id);
	lastResetTime.delete(id);
}

// --- PTY Manager ---

let mainWindow: BrowserWindow;

const ptyManager = new PtyManager({
	onOutput: (id, data) => {
		mainWindow.webview.rpc.send.terminalOutput({ id, data });
		updateTerminalStatus(id, "running");
		resetIdleTimer(id);
		// Inspector: update element text with latest output snippet
		const eid = terminalEidMap.get(id);
		if (eid !== undefined) {
			const buf = ptyManager.getOutputBuffer(id);
			if (buf) inspector.updateText(eid, buf.slice(-4000));
		}
	},
	onTitle: (id, title) => {
		titleById.set(id, title);
		mainWindow.webview.rpc.send.terminalTitle({ id, title });
		const eid = terminalEidMap.get(id);
		if (eid !== undefined) inspector.updateName(eid, title);
	},
	onCwd: (id, cwd) => {
		cwdById.set(id, cwd);
		mainWindow.webview.rpc.send.terminalCwd({ id, cwd });
		const eid = terminalEidMap.get(id);
		if (eid !== undefined) inspector.updateProperty(eid, "cwd", cwd);
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
		clearBellDebounce(id);
		clearActivityTimer(id);
		const eid = terminalEidMap.get(id);
		if (eid !== undefined) {
			inspector.updateProperty(eid, "status", "exited");
			inspector.updateProperty(eid, "exit_code", String(exitCode));
		}
	},
});

// --- RPC ---

const terminalRPC = BrowserView.defineRPC<TerminalRPCType>({
	maxRequestTime: RPC_MAX_REQUEST_TIME,
	handlers: {
		requests: {
			getConfig: () => ({ config }),

			createTerminal: ({ cols, rows, command, cwd }) => {
				const resolvedCwd = cwd || config["working-directory"] || undefined;
				const id = ptyManager.create(cols, rows, {
					command,
					cwd: resolvedCwd,
					env: config.env,
				});
				const eid = inspector.register({
					name: `Terminal ${id}`,
					properties: {
						terminal_id: id,
						status: "running",
						cwd: resolvedCwd || "",
					},
				});
				terminalEidMap.set(id, eid);
				return { id };
			},

			closeTerminal: ({ id }) => {
				titleById.delete(id);
				cwdById.delete(id);
				clearBellDebounce(id);
				clearActivityTimer(id);
				const eid = terminalEidMap.get(id);
				if (eid !== undefined) {
					inspector.unregister(eid);
					terminalEidMap.delete(id);
				}
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

			saveSession: ({ tiles }) => {
				saveSessionFile(tiles);
				if (!inspector.ready) inspector.setReady();
				return { success: true };
			},

			loadSession: () => {
				return { session: loadSessionFile() };
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

// --- Inspector custom methods ---

inspector.registerMethod("write_to_terminal", (params) => {
	const { terminal_id, data } = params;
	if (!terminal_id || !data) return { error: "missing terminal_id or data" };
	const ok = ptyManager.write(terminal_id, data);
	return { ok };
});

inspector.registerMethod("get_terminal_output", (params) => {
	const { terminal_id } = params;
	if (!terminal_id) return { error: "missing terminal_id" };
	const output = ptyManager.getOutputBuffer(terminal_id);
	return { text: output || "" };
});

inspector.registerMethod("create_tile", async (params) => {
	const { id } = await mainWindow.webview.rpc.request.inspectorCreateTile({
		command: params.command || undefined,
		cwd: params.cwd || undefined,
	});
	return { terminal_id: id };
});

inspector.registerMethod("close_tile", async (params) => {
	const { terminal_id } = params;
	if (!terminal_id) return { error: "missing terminal_id" };
	const { success } = await mainWindow.webview.rpc.request.inspectorCloseTile({
		terminalId: terminal_id,
	});
	return { success };
});

inspector.registerMethod("list_terminals", () => {
	const terminals: Array<{
		terminal_id: string;
		name: string;
		status: string;
		cwd: string;
	}> = [];
	for (const [termId] of terminalEidMap) {
		const title = titleById.get(termId) || `Terminal ${termId}`;
		const status = terminalStatus.get(termId) || "unknown";
		terminals.push({
			terminal_id: termId,
			name: title,
			status,
			cwd: cwdById.get(termId) || "",
		});
	}
	return { terminals };
});

inspector.registerMethod("send_to_terminal", (params) => {
	const { terminal_id, message } = params;
	if (!terminal_id || !message) return { error: "missing terminal_id or message" };
	const ok = ptyManager.write(terminal_id, message + "\r");
	return { ok };
});

console.log("Terminal Commander started!");
