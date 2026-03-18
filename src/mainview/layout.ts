import { getTileCount, allTiles } from "./tileState.ts";

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

	const cols = Math.ceil(Math.sqrt(count));
	const rows = Math.ceil(count / cols);

	el.style.display = "grid";
	el.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
	el.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

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
