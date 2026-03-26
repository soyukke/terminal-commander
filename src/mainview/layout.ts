import { getTileCount, allTiles, getTileOrder, getTile } from "./tileState.ts";
import { bestGrid } from "../shared/gridCalc.ts";
import { DEFAULT_CONFIG } from "../shared/config.ts";

const FALLBACK_W = DEFAULT_CONFIG["window-width"];
const FALLBACK_H = DEFAULT_CONFIG["window-height"];

let _container: HTMLElement | null = null;

function container(): HTMLElement {
	if (!_container) {
		_container = document.getElementById("terminal-container")!;
	}
	return _container;
}

let fitScheduled = false;

export function fitAllTiles(): void {
	if (fitScheduled) return;
	fitScheduled = true;
	// Double-RAF: first RAF lets CSS Grid settle, second RAF runs fit
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			fitScheduled = false;
			for (const tile of allTiles()) {
				try {
					tile.fitAddon.fit();
				} catch {
					// ignore fit errors during layout transition
				}
			}
		});
	});
}

/** Fit a single tile's terminal to its container */
function fitTile(tileId: string): void {
	const tile = getTile(tileId);
	if (!tile) return;
	try {
		tile.fitAddon.fit();
	} catch {
		// ignore fit errors during layout transition
	}
}

// Per-tile ResizeObserver: watches each tile-body for size changes
const tileResizeObserver = new ResizeObserver((entries) => {
	for (const entry of entries) {
		const tileId = (entry.target as HTMLElement).dataset.tileId;
		if (tileId) fitTile(tileId);
	}
});

/** Start observing a tile-body element for resize. Call when creating a tile. */
export function observeTileResize(tileBody: HTMLElement, tileId: string): void {
	tileBody.dataset.tileId = tileId;
	tileResizeObserver.observe(tileBody);
}

/** Stop observing a tile-body element. Call when closing a tile. */
export function unobserveTileResize(tileBody: HTMLElement): void {
	tileResizeObserver.unobserve(tileBody);
}

export function recalculateLayout(): void {
	const count = getTileCount();
	const el = container();
	if (count === 0) {
		el.style.display = "";
		return;
	}

	const { cols, rows } = bestGrid(count, el.clientWidth || FALLBACK_W, el.clientHeight || FALLBACK_H);

	el.style.display = "grid";
	el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
	el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

	// Reorder DOM elements to match tileOrder
	for (const id of getTileOrder()) {
		const tile = getTile(id);
		if (tile?.element.parentElement === el) {
			el.appendChild(tile.element);
		}
	}

	fitAllTiles();
}

export function getContainer(): HTMLElement {
	return container();
}

// Debounced resize handler
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

export function setupResizeHandler(): void {
	window.addEventListener("resize", () => {
		if (resizeTimer) clearTimeout(resizeTimer);
		resizeTimer = setTimeout(fitAllTiles, 100);
	});
}
