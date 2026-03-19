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
		resizeTimer = setTimeout(fitAllTiles, 150);
	});
}
