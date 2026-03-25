const EMPTY_PENALTY = 0.85;

/**
 * Calculate the best cols x rows grid for the given tile count,
 * choosing the layout where each cell is closest to a square
 * while penalizing empty cells.
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
		const emptyFraction = (cols * rows - count) / count;
		const score = Math.abs(Math.log(ratio)) + emptyFraction * EMPTY_PENALTY;
		if (score < bestScore) {
			bestScore = score;
			bestCols = cols;
		}
	}

	return { cols: bestCols, rows: Math.ceil(count / bestCols) };
}

/**
 * Determine where a new tile should be inserted relative to the focused tile.
 * "horizontal" = right after focused in the linear order.
 * "vertical" = same column, next row in the post-insert grid.
 *
 * Returns the index in tileOrder after which the new tile should be inserted.
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

	if (direction === "horizontal") {
		return focusIdx;
	}

	// Vertical: target position is one grid-row below focused
	const { cols } = bestGrid(count + 1, containerW, containerH);
	return Math.min(focusIdx + cols - 1, count - 1);
}
