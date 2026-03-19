/**
 * Calculate the best cols x rows grid for the given tile count,
 * choosing the layout where each cell is closest to a square.
 */
export function bestGrid(
	count: number,
	containerW: number,
	containerH: number,
): { cols: number; rows: number } {
	if (count <= 1) return { cols: 1, rows: 1 };

	let bestCols = 1;
	let bestScore = Infinity;

	for (let cols = 1; cols <= count; cols++) {
		const rows = Math.ceil(count / cols);
		const cellW = containerW / cols;
		const cellH = containerH / rows;
		const ratio = cellW / cellH;
		const score = Math.abs(Math.log(ratio));
		if (score < bestScore) {
			bestScore = score;
			bestCols = cols;
		}
	}

	return { cols: bestCols, rows: Math.ceil(count / bestCols) };
}

/**
 * Determine where a new tile should be inserted relative to the focused tile.
 * "horizontal" = to the right (same row), "vertical" = below (next row).
 *
 * Returns the index in tileOrder to insert after.
 */
export function getSplitInsertIndex(
	focusedId: string,
	direction: "horizontal" | "vertical",
	tileOrder: readonly string[],
	containerW: number,
	containerH: number,
): number {
	const count = tileOrder.length;
	const focusIdx = tileOrder.indexOf(focusedId);
	if (focusIdx === -1) return count;

	const { cols } = bestGrid(count + 1, containerW, containerH);
	const focusRow = Math.floor(focusIdx / cols);
	const focusCol = focusIdx % cols;

	if (direction === "horizontal") {
		return focusIdx;
	} else {
		const targetIdx = (focusRow + 1) * cols + focusCol;
		return Math.min(targetIdx - 1, count);
	}
}
