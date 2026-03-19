import { Electroview } from "electrobun/view";
import type { TerminalRPCType } from "../shared/types.ts";
import { configToTerminalOptions, type AppConfig } from "../shared/config.ts";
import {
	getTileCount,
	getTile,
	addTile,
	removeTile,
	getFocusedTileId,
	setFocusedTileId,
	nextTileName,
	getFirstTileId,
} from "./tileState.ts";
import { recalculateLayout, getContainer, setupResizeHandler } from "./layout.ts";
import { createTileElement } from "./tileDOM.ts";

declare const Terminal: any;
declare const FitAddon: any;

// --- RPC ---

const rpcHandler = Electroview.defineRPC<TerminalRPCType>({
	handlers: {
		requests: {},
		messages: {
			terminalOutput: ({ id, data }) => {
				getTile(id)?.terminal.write(data);
			},
			terminalExit: ({ id, exitCode }) => {
				getTile(id)?.terminal.writeln(
					`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`
				);
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

	// Apply config-driven CSS variables
	document.documentElement.style.setProperty("--bg-primary", config.background);
	document.documentElement.style.setProperty("--text-primary", config.foreground);

	return cachedConfig;
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
	}
}

// --- Create tile ---

async function createTile(opts?: { name?: string; command?: string }): Promise<void> {
	const { app: config, terminal: termOpts } = await loadConfig();
	const container = getContainer();
	const tileName = opts?.name || nextTileName();
	const command = opts?.command ?? config.command;

	const { tileEl, body, closeBtn } = createTileElement(tileName, (tileId, newName) => {
		const t = getTile(tileId);
		if (t) t.name = newName;
	});
	container.appendChild(tileEl);

	// xterm.js with config-driven options
	const term = new Terminal(termOpts);
	const fitAddon = new FitAddon.FitAddon();
	term.loadAddon(fitAddon);
	term.open(body);
	requestAnimationFrame(() => fitAddon.fit());

	// PTY via RPC
	const { id } = await rpc.request.createTerminal({
		cols: term.cols,
		rows: term.rows,
		command,
	});

	tileEl.dataset.tileId = id;

	// Input → PTY (fire-and-forget)
	term.onData((data: string) => {
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
		await rpc.request.closeTerminal({ id });
		term.dispose();
		tileEl.remove();
		removeTile(id);
		if (getFocusedTileId() === id) {
			const nextId = getFirstTileId();
			setFocusedTileId(nextId);
			if (nextId) focusTile(nextId);
		}
		updateTileCount();
		recalculateLayout();
	});

	addTile({
		id,
		name: tileName,
		color: config.palette[4] || "#7aa2f7",
		terminal: term,
		fitAddon,
		element: tileEl,
	});

	focusTile(id);
	updateTileCount();
	recalculateLayout();
}

// --- Toolbar ---

document.getElementById("btn-add")?.addEventListener("click", () => createTile());
document.getElementById("btn-split-h")?.addEventListener("click", () => createTile());
document.getElementById("btn-split-v")?.addEventListener("click", () => createTile());
document.getElementById("btn-shell")?.addEventListener("click", () =>
	createTile({ name: "Shell", command: undefined })
);

document.querySelectorAll(".view-btn").forEach((btn) => {
	btn.addEventListener("click", () => {
		document.querySelectorAll(".view-btn").forEach((b) => b.classList.remove("active"));
		btn.classList.add("active");
	});
});

// --- Init ---

setupResizeHandler();
createTile();
