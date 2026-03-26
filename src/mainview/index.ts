import { Electroview } from "electrobun/view";
import { RPC_MAX_REQUEST_TIME, type TerminalRPCType, type TerminalStatus, type SessionTile } from "../shared/types.ts";
import { configToTerminalOptions, type AppConfig, DEFAULT_CONFIG } from "../shared/config.ts";
import {
	type Tile,
	getTileCount,
	getTile,
	addTile,
	removeTile,
	getFocusedTileId,
	setFocusedTileId,
	nextTileName,
	getFirstTileId,
	getTileOrder,
	getPrevTileId,
	getNextTileId,
	allTiles,
} from "./tileState.ts";
import { recalculateLayout, getContainer, setupResizeHandler, observeTileResize, unobserveTileResize } from "./layout.ts";
import { getSplitInsertIndex } from "../shared/gridCalc.ts";
import { createTileElement } from "./tileDOM.ts";
import { showTileContextMenu } from "./contextMenu.ts";
import { showDirPickerModal } from "./dirPickerModal.ts";
import { resolveKeybindings, makeXtermKeyHandler, matchesEvent, type NormalizedCombo } from "./keybindings.ts";
import { toggleSettingsModal } from "./settingsModal.ts";
import { shortenPath } from "../shared/pathUtils.ts";

declare const Terminal: any;
declare const FitAddon: any;

function setCwdDisplay(span: HTMLElement, cwd: string): void {
	span.textContent = shortenPath(cwd);
	span.title = cwd;
}

function getFocusedCwd(): string | undefined {
	const focusedId = getFocusedTileId();
	return focusedId ? (getTile(focusedId)?.cwd || undefined) : undefined;
}

async function openDirPickerAndCreateTile(cwd?: string): Promise<void> {
	const dir = await showDirPickerModal(rpc, cwd);
	if (dir) {
		await rpc.request.saveRecentDir({ dir });
		await createTile({ cwd: dir });
	}
}

/**
 * Change an existing tile's working directory by closing the old PTY
 * and creating a new one in the selected directory, preserving tile
 * position, name, and color.
 */
async function changeTileCwd(tileId: string): Promise<void> {
	const tile = getTile(tileId);
	if (!tile) return;

	const dir = await showDirPickerModal(rpc, tile.cwd || undefined);
	if (!dir) return;

	await rpc.request.saveRecentDir({ dir });

	// Save tile metadata before closing
	const savedName = tile.name;
	const savedColor = tile.color;
	const order = getTileOrder();
	const idx = order.indexOf(tileId);
	const insertAfterId = idx > 0 ? order[idx - 1] : undefined;

	// Close the old tile
	await closeTile(tileId);

	// Create a new tile with the same properties in the same position
	await createTile({
		name: savedName,
		color: savedColor,
		cwd: dir,
		insertAfterId,
	});
}

// --- RPC ---

const rpcHandler = Electroview.defineRPC<TerminalRPCType>({
	maxRequestTime: RPC_MAX_REQUEST_TIME,
	handlers: {
		requests: {
			inspectorCreateTile: async ({ command, cwd }) => {
				await createTile({ command: command || undefined, cwd: cwd || undefined });
				// Return the id of the last created tile
				const order = getTileOrder();
				const lastId = order[order.length - 1];
				return { id: lastId || "" };
			},
			inspectorCloseTile: async ({ terminalId }) => {
				const tile = getTile(terminalId);
				if (!tile) return { success: false };
				await closeTile(terminalId);
				return { success: true };
			},
		},
		messages: {
			terminalOutput: ({ id, data }) => {
				getTile(id)?.terminal.write(data);
			},
			terminalTitle: ({ id, title }) => {
				const tile = getTile(id);
				if (tile) {
					tile.name = title;
					tile.nameSpan.textContent = title;
				}
			},
			terminalBell: ({ id }) => {
				const tile = getTile(id);
				if (tile) {
					tile.badgeSpan.hidden = false;
				}
			},
			terminalExit: ({ id, exitCode }) => {
				const tile = getTile(id);
				if (tile) {
					tile.terminal.writeln(
						`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`
					);
					tile.badgeSpan.hidden = false;
					setTileStatus(tile, "exited");
				}
			},
			terminalStatus: ({ id, status }) => {
				const tile = getTile(id);
				if (tile && tile.status !== "exited") {
					setTileStatus(tile, status);
				}
			},
			terminalCwd: ({ id, cwd }) => {
				const tile = getTile(id);
				if (tile && tile.cwd !== cwd) {
					tile.cwd = cwd;
					setCwdDisplay(tile.cwdSpan, cwd);
					triggerSessionSave();
				}
			},
		},
	},
});

const electroview = new Electroview({ rpc: rpcHandler });
const rpc = electroview.rpc;

// --- Config (loaded from Bun process) ---

let cachedConfig: { app: AppConfig; terminal: ReturnType<typeof configToTerminalOptions> } | null = null;

async function loadConfig() {
	if (cachedConfig) return cachedConfig;
	const { config } = await rpc.request.getConfig({});

	cachedConfig = {
		app: config,
		terminal: configToTerminalOptions(config),
	};

	document.documentElement.style.setProperty("--bg-primary", config.background);
	document.documentElement.style.setProperty("--text-primary", config.foreground);

	return cachedConfig;
}

// --- Apply config changes (for settings preview and save) ---

function applyConfig(newApp: AppConfig): void {
	const newTermOpts = configToTerminalOptions(newApp);
	cachedConfig = { app: newApp, terminal: newTermOpts };

	// Update CSS variables
	document.documentElement.style.setProperty("--bg-primary", newApp.background);
	document.documentElement.style.setProperty("--text-primary", newApp.foreground);

	// Update all existing xterm.js instances
	for (const tile of allTiles()) {
		tile.terminal.options = newTermOpts;
	}
}

// --- Session auto-save (debounced) ---

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function triggerSessionSave(): void {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		const tiles: SessionTile[] = allTiles().map((t) => ({
			name: t.name,
			color: t.color,
			cwd: t.cwd,
			command: null, // command is not tracked per-tile after creation
		}));
		rpc.request.saveSession({ tiles }).catch((err) => {
			console.error("Session save failed:", err);
		});
	}, 200);
}

// --- Keybinding setup ---

let xtermKeyHandler: ((e: KeyboardEvent) => boolean) | null = null;
let resolvedActionMap: Map<string, NormalizedCombo> | null = null;

async function getXtermKeyHandler(): Promise<(e: KeyboardEvent) => boolean> {
	if (xtermKeyHandler) return xtermKeyHandler;
	const { app: config } = await loadConfig();
	resolvedActionMap = resolveKeybindings(config.keybind);
	xtermKeyHandler = makeXtermKeyHandler(resolvedActionMap, dispatchAction);
	return xtermKeyHandler;
}

function dispatchAction(action: string): void {
	switch (action) {
		case "new_tile":
			createTile({ cwd: getFocusedCwd() });
			break;
		case "close_tile":
			closeFocusedTile();
			break;
		case "focus_prev": {
			const id = getPrevTileId();
			if (id) focusTile(id);
			break;
		}
		case "focus_next": {
			const id = getNextTileId();
			if (id) focusTile(id);
			break;
		}
		case "split_horizontal":
			createTile({ splitDirection: "horizontal" });
			break;
		case "split_vertical":
			createTile({ splitDirection: "vertical" });
			break;
		case "open_settings":
			(async () => {
				const { app } = await loadConfig();
				toggleSettingsModal(
					app,
					(config) => applyConfig(config),
					async (config) => {
						applyConfig(config);
						await rpc.request.saveConfig({ config });
						// Invalidate keybinding handler in case keybinds changed
						xtermKeyHandler = null;
						resolvedActionMap = null;
					},
				);
			})();
			break;
	}
}

// --- Close tile ---

async function closeTile(id: string): Promise<void> {
	const tile = getTile(id);
	if (!tile) return;

	// Stop observing resize before removing
	const tileBody = tile.element.querySelector(".tile-body") as HTMLElement | null;
	if (tileBody) unobserveTileResize(tileBody);

	await rpc.request.closeTerminal({ id });
	tile.terminal.dispose();
	tile.element.remove();
	const wasFocused = getFocusedTileId() === id;
	removeTile(id);

	if (wasFocused) {
		const nextId = getFirstTileId();
		setFocusedTileId(nextId);
		if (nextId) focusTile(nextId);
	}

	updateTileCount();
	recalculateLayout();
	triggerSessionSave();
}

async function closeFocusedTile(): Promise<void> {
	const id = getFocusedTileId();
	if (id) await closeTile(id);
}

// --- Tile count display ---

function updateTileCount(): void {
	const el = document.getElementById("tile-count");
	if (el) {
		const size = getTileCount();
		el.textContent = `${size} terminal${size !== 1 ? "s" : ""}`;
	}
}

// --- Focus management ---

function focusTile(id: string): void {
	const prevId = getFocusedTileId();
	if (prevId) {
		getTile(prevId)?.element.classList.remove("focused");
	}

	setFocusedTileId(id);
	const tile = getTile(id);
	if (tile) {
		tile.element.classList.add("focused");
		tile.terminal.focus();
		tile.badgeSpan.hidden = true;
	}
}

// --- Tile status ---

const STATUS_LABELS: Record<TerminalStatus, string> = {
	running: "Running",
	idle: "Idle",
	exited: "Exited",
};

function setTileStatus(tile: Tile, status: TerminalStatus): void {
	if (tile.status === status) return;
	tile.status = status;
	tile.statusSpan.className = `tile-status tile-status--${status}`;
	tile.statusSpan.title = STATUS_LABELS[status];
}

// --- Tile color ---

function setTileColor(tile: Tile, color: string): void {
	tile.color = color;
	tile.colorDot.style.backgroundColor = color;
	tile.element.style.setProperty("--tile-color", color);
}

// --- Create tile ---

interface CreateTileOpts {
	name?: string;
	command?: string;
	cwd?: string;
	color?: string;
	splitDirection?: "horizontal" | "vertical";
	insertAfterId?: string;
}

async function createTile(opts?: CreateTileOpts): Promise<void> {
	const { app: config, terminal: termOpts } = await loadConfig();
	const container = getContainer();
	const tileName = opts?.name || nextTileName();
	const command = opts?.command ?? config.command;
	const defaultColor = config.palette[4] || "#7aa2f7";

	const { tileEl, body, closeBtn, nameSpan, cwdSpan, badgeSpan, colorDot, statusSpan, triggerRename } =
		createTileElement(tileName, {
			onRename: (tileId, newName) => {
				const t = getTile(tileId);
				if (t) {
					t.name = newName;
					triggerSessionSave();
				}
			},
			onContextMenu: (x, y, tileId) => {
				const t = getTile(tileId);
				if (!t) return;
				showTileContextMenu(x, y, t.color, config.palette, {
					onRename: triggerRename,
					onColorChange: (color) => {
						setTileColor(t, color);
						triggerSessionSave();
					},
				});
			},
			onCwdClick: async (tileId) => {
				await changeTileCwd(tileId);
			},
		});

	// Determine insertion position
	const focusedId = getFocusedTileId();
	let insertAfterId: string | undefined = opts?.insertAfterId;

	if (!insertAfterId) {
		if (focusedId && opts?.splitDirection) {
			const order = getTileOrder();
			const insertIdx = getSplitInsertIndex(
				focusedId,
				opts.splitDirection,
				order,
				container.clientWidth || DEFAULT_CONFIG["window-width"],
				container.clientHeight || DEFAULT_CONFIG["window-height"],
			);
			insertAfterId = order[insertIdx];
		} else if (focusedId) {
			insertAfterId = focusedId;
		}
	}

	container.appendChild(tileEl);

	// xterm.js with config-driven options
	const term = new Terminal(termOpts);
	const fitAddon = new FitAddon.FitAddon();
	term.loadAddon(fitAddon);
	term.open(body);

	requestAnimationFrame(() => fitAddon.fit());

	// Keybinding interception (with clipboard support)
	const keyHandler = await getXtermKeyHandler();
	term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
		if (e.type !== "keydown") return true;

		// Cmd+C: copy selection to clipboard (if selection exists)
		if (e.metaKey && e.key === "c") {
			const sel = term.getSelection();
			if (sel) {
				navigator.clipboard.writeText(sel);
				return false;
			}
			// No selection → let xterm handle as normal (Ctrl+C / SIGINT)
			return true;
		}

		// Cmd+V: paste from clipboard
		if (e.metaKey && e.key === "v") {
			navigator.clipboard.readText().then((text) => {
				if (text) term.paste(text);
			});
			return false;
		}

		return keyHandler(e);
	});

	// PTY via RPC
	const { id } = await rpc.request.createTerminal({
		cols: term.cols,
		rows: term.rows,
		command,
		cwd: opts?.cwd,
	});

	tileEl.dataset.tileId = id;

	// Observe tile-body for resize so fit() runs when CSS Grid changes tile dimensions
	observeTileResize(body, id);

	// Track compositionend timing for IME dedup
	const textarea = (term as any).textarea as HTMLTextAreaElement | undefined;
	let lastCompositionEndTime = 0;
	if (textarea) {
		textarea.addEventListener("compositionend", () => {
			lastCompositionEndTime = performance.now();
		});
	}

	// IME deduplication: Electrobun's WebView fires duplicate onData for
	// the same composed text (60–130ms apart). Detect and skip the duplicate.
	let lastOnDataText: string | null = null;
	let lastOnDataTime = 0;

	// Input → PTY (fire-and-forget)
	term.onData((data: string) => {
		const now = performance.now();
		const isPostComposition = (now - lastCompositionEndTime) < 300;
		rpc.send.debugLog({ tag: "ON_DATA", data: `len=${data.length} text=${JSON.stringify(data)} dt=${(now - lastOnDataTime).toFixed(0)}ms postComp=${isPostComposition}` });
		// Skip duplicate IME input: same string within 150ms
		// Multi-char: always dedup. Single-char: only dedup right after compositionend.
		if ((data.length > 1 || isPostComposition) && data === lastOnDataText && (now - lastOnDataTime) < 150) {
			rpc.send.debugLog({ tag: "ON_DATA_SKIP", data: `duplicate blocked: ${JSON.stringify(data)}` });
			lastOnDataText = null; // reset so a third won't be blocked
			return;
		}
		lastOnDataText = data;
		lastOnDataTime = now;
		rpc.send.writeToTerminal({ id, data });
	});

	// Resize → PTY (fire-and-forget)
	term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
		rpc.send.resizeTerminal({ id, cols, rows });
	});

	// Focus on click
	tileEl.addEventListener("mousedown", () => focusTile(id));

	// Close
	closeBtn.addEventListener("click", async (e) => {
		e.stopPropagation();
		await closeTile(id);
	});

	if (opts?.cwd) {
		setCwdDisplay(cwdSpan, opts.cwd);
	}

	const tile: Tile = {
		id,
		name: tileName,
		color: defaultColor,
		status: "running",
		cwd: opts?.cwd || "",
		terminal: term,
		fitAddon,
		element: tileEl,
		nameSpan,
		cwdSpan,
		badgeSpan,
		colorDot,
		statusSpan,
	};

	addTile(tile, insertAfterId);
	setTileColor(tile, opts?.color || defaultColor);
	statusSpan.className = `tile-status tile-status--running`;
	statusSpan.title = STATUS_LABELS["running"];
	focusTile(id);
	updateTileCount();
	recalculateLayout();
	triggerSessionSave();
}

// --- Toolbar ---

document.getElementById("btn-add")?.addEventListener("click", () =>
	openDirPickerAndCreateTile(getFocusedCwd())
);
document.getElementById("btn-split-h")?.addEventListener("click", () =>
	createTile({ splitDirection: "horizontal" })
);
document.getElementById("btn-split-v")?.addEventListener("click", () =>
	createTile({ splitDirection: "vertical" })
);
document.getElementById("btn-shell")?.addEventListener("click", () =>
	createTile({ name: "Shell", command: undefined })
);

document.querySelectorAll(".view-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
		btn.classList.add("active");
	});
});

// --- Global keybindings (outside xterm) ---

document.addEventListener("keydown", (e) => {
	if (e.type !== "keydown") return;
	// Only handle when focus is outside xterm (xterm has its own key handler)
	if (document.activeElement?.closest(".xterm")) return;
	if (!resolvedActionMap) return;
	for (const [action, combo] of resolvedActionMap) {
		if (matchesEvent(combo, e)) {
			e.preventDefault();
			dispatchAction(action);
			return;
		}
	}
});

// --- Init ---

setupResizeHandler();

(async () => {
	// Try to restore previous session
	const { session } = await rpc.request.loadSession({});
	if (session && session.tiles.length > 0) {
		for (const t of session.tiles) {
			await createTile({
				name: t.name,
				color: t.color,
				cwd: t.cwd,
				command: t.command ?? undefined,
			});
		}
		return;
	}

	// No session — show directory picker for first tile
	const dir = await showDirPickerModal(rpc);
	if (dir) {
		await rpc.request.saveRecentDir({ dir });
		createTile({ cwd: dir });
	} else {
		createTile();
	}
})();
