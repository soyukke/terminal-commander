import type { TerminalStatus } from "../shared/types.ts";

export interface Tile {
	id: string;
	name: string;
	color: string;
	status: TerminalStatus;
	cwd: string;
	terminal: any;
	fitAddon: any;
	element: HTMLElement;
	nameSpan: HTMLElement;
	badgeSpan: HTMLElement;
	colorDot: HTMLElement;
	statusSpan: HTMLElement;
}

const tilesById = new Map<string, Tile>();
const tileOrder: string[] = [];
let focusedTileId: string | null = null;
let tileCounter = 0;

export function getTileCount(): number {
	return tilesById.size;
}

export function allTiles(): Tile[] {
	return tileOrder.flatMap((id) => {
		const tile = tilesById.get(id);
		return tile ? [tile] : [];
	});
}

export function getTile(id: string): Tile | undefined {
	return tilesById.get(id);
}

export function getTileOrder(): readonly string[] {
	return tileOrder;
}

export function addTile(tile: Tile, afterId?: string): void {
	tilesById.set(tile.id, tile);
	if (afterId) {
		const idx = tileOrder.indexOf(afterId);
		if (idx !== -1) {
			tileOrder.splice(idx + 1, 0, tile.id);
			return;
		}
	}
	tileOrder.push(tile.id);
}

export function removeTile(id: string): void {
	tilesById.delete(id);
	const idx = tileOrder.indexOf(id);
	if (idx !== -1) tileOrder.splice(idx, 1);
}

export function getFocusedTileId(): string | null {
	return focusedTileId;
}

export function setFocusedTileId(id: string | null): void {
	focusedTileId = id;
}

export function nextTileName(): string {
	tileCounter++;
	return `Terminal ${tileCounter}`;
}

export function getFirstTileId(): string | null {
	return tileOrder.length > 0 ? tileOrder[0] : null;
}

export function getPrevTileId(): string | null {
	if (tileOrder.length === 0 || focusedTileId === null) return null;
	const idx = tileOrder.indexOf(focusedTileId);
	if (idx === -1) return tileOrder[0];
	if (idx === 0) return tileOrder[tileOrder.length - 1];
	return tileOrder[idx - 1];
}

export function getNextTileId(): string | null {
	if (tileOrder.length === 0 || focusedTileId === null) return null;
	const idx = tileOrder.indexOf(focusedTileId);
	if (idx === -1 || idx >= tileOrder.length - 1) return tileOrder[0];
	return tileOrder[idx + 1];
}
