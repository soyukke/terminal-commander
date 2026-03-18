export interface Tile {
	id: string;
	name: string;
	color: string;
	terminal: any;
	fitAddon: any;
	element: HTMLElement;
}

const tiles = new Map<string, Tile>();
let focusedTileId: string | null = null;
let tileCounter = 0;

export function getTileCount(): number {
	return tiles.size;
}

export function allTiles(): IterableIterator<Tile> {
	return tiles.values();
}

export function getTile(id: string): Tile | undefined {
	return tiles.get(id);
}

export function addTile(tile: Tile): void {
	tiles.set(tile.id, tile);
}

export function removeTile(id: string): void {
	tiles.delete(id);
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
	const first = tiles.keys().next();
	return first.done ? null : first.value;
}
