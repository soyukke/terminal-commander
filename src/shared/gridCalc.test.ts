import { describe, test, expect } from "bun:test";
import { bestGrid, getSplitInsertIndex } from "./gridCalc.ts";

// --- bestGrid ---

describe("bestGrid", () => {
	test("1 tile → 1x1", () => {
		expect(bestGrid(1, 1200, 800)).toEqual({ cols: 1, rows: 1 });
		expect(bestGrid(0, 1200, 800)).toEqual({ cols: 1, rows: 1 });
	});

	test("2 tiles: wide → 2x1, tall → 1x2", () => {
		expect(bestGrid(2, 1600, 800)).toEqual({ cols: 2, rows: 1 });
		expect(bestGrid(2, 600, 1200)).toEqual({ cols: 1, rows: 2 });
	});

	test("all cells fit the tile count", () => {
		for (let n = 1; n <= 20; n++) {
			const { cols, rows } = bestGrid(n, 1200, 800);
			expect(cols * rows).toBeGreaterThanOrEqual(n);
		}
	});

	test("cells are approximately square", () => {
		for (let n = 1; n <= 12; n++) {
			const { cols, rows } = bestGrid(n, 1920, 1080);
			const ratio = (1920 / cols) / (1080 / rows);
			expect(ratio).toBeGreaterThan(0.3);
			expect(ratio).toBeLessThan(3.0);
		}
	});

	test("wide window prefers more columns", () => {
		expect(bestGrid(4, 2400, 600).cols).toBeGreaterThan(bestGrid(4, 600, 2400).cols);
	});
});

// User expected sequential add layout for 1200x800:
//  2: a b       (2x1)
//  3: a b / c _ (2x2, third goes below)
//  4: a b / c d (2x2, bottom fills)
//  5: a b c / d e _ (3x2, new column)
//  6: a b c / d e f (3x2, filled)
describe("bestGrid: sequential add layout (1200x800)", () => {
	test("2 tiles → 2x1 (side by side)", () => {
		expect(bestGrid(2, 1200, 800)).toEqual({ cols: 2, rows: 1 });
	});

	test("3 tiles → 2x2 (third goes below, wide)", () => {
		expect(bestGrid(3, 1200, 800)).toEqual({ cols: 2, rows: 2 });
	});

	test("4 tiles → 2x2 (bottom row fills up)", () => {
		expect(bestGrid(4, 1200, 800)).toEqual({ cols: 2, rows: 2 });
	});

	test("5 tiles → 3x2 (new column added)", () => {
		expect(bestGrid(5, 1200, 800)).toEqual({ cols: 3, rows: 2 });
	});

	test("6 tiles → 3x2 (grid filled)", () => {
		expect(bestGrid(6, 1200, 800)).toEqual({ cols: 3, rows: 2 });
	});
});

// --- getSplitInsertIndex ---

// Helper: simulate insert, compute resulting grid positions
function simulateSplit(
	focusedId: string,
	direction: "horizontal" | "vertical",
	order: string[],
	w = 1200,
	h = 800,
) {
	const idx = getSplitInsertIndex(focusedId, direction, order, w, h);
	const afterId = order[idx]; // undefined if idx >= order.length
	const newOrder = [...order];
	if (afterId !== undefined) {
		const pos = newOrder.indexOf(afterId);
		newOrder.splice(pos + 1, 0, "NEW");
	} else {
		newOrder.push("NEW");
	}

	const { cols } = bestGrid(newOrder.length, w, h);
	const focusPos = newOrder.indexOf(focusedId);
	const newPos = newOrder.indexOf("NEW");

	return {
		idx,
		newOrder,
		focusGrid: { row: Math.floor(focusPos / cols), col: focusPos % cols },
		newGrid: { row: Math.floor(newPos / cols), col: newPos % cols },
	};
}

describe("getSplitInsertIndex: edge cases", () => {
	test("returns count for unknown focused id", () => {
		expect(getSplitInsertIndex("x", "horizontal", ["a", "b"], 1200, 800)).toBe(2);
	});

	test("empty order returns 0", () => {
		expect(getSplitInsertIndex("a", "horizontal", [], 1200, 800)).toBe(0);
	});

	test("insert index is always within [0, count]", () => {
		for (let n = 1; n <= 10; n++) {
			const order = Array.from({ length: n }, (_, i) => `t${i}`);
			for (const id of order) {
				for (const dir of ["horizontal", "vertical"] as const) {
					const idx = getSplitInsertIndex(id, dir, order, 1200, 800);
					expect(idx).toBeGreaterThanOrEqual(0);
					expect(idx).toBeLessThanOrEqual(n);
				}
			}
		}
	});
});

// Horizontal split: NEW goes right after focused in order.
// When focused is not at end-of-row, NEW appears to the right in the grid.
describe("horizontal split", () => {
	test("1 tile → NEW to the right", () => {
		const { focusGrid, newGrid } = simulateSplit("a", "horizontal", ["a"]);
		expect(newGrid.row).toBe(focusGrid.row);
		expect(newGrid.col).toBe(focusGrid.col + 1);
	});

	test("2 tiles: split first → NEW right of first", () => {
		const { focusGrid, newGrid } = simulateSplit("a", "horizontal", ["a", "b"]);
		expect(newGrid.row).toBe(focusGrid.row);
		expect(newGrid.col).toBe(focusGrid.col + 1);
	});

	test("4 tiles: split non-end-of-row tiles → NEW to the right", () => {
		// "a" is at (0,0) and "d" is at (1,0) in the new 3x2 grid — not at row end
		for (const id of ["a", "b", "d"]) {
			const { focusGrid, newGrid } = simulateSplit(id, "horizontal", ["a", "b", "c", "d"]);
			expect(newGrid.row).toBe(focusGrid.row);
			expect(newGrid.col).toBe(focusGrid.col + 1);
		}
	});
});

// Vertical split: NEW should appear below focused (same column, next row).
// Works when focused is early enough in the grid that targetPos doesn't exceed count.
describe("vertical split", () => {
	test("2 tiles: split first → NEW below", () => {
		const { focusGrid, newGrid } = simulateSplit("a", "vertical", ["a", "b"]);
		expect(newGrid.col).toBe(focusGrid.col);
		expect(newGrid.row).toBe(focusGrid.row + 1);
	});

	test("4 tiles: split first two → NEW below each", () => {
		for (const id of ["a", "b"]) {
			const { focusGrid, newGrid } = simulateSplit(id, "vertical", ["a", "b", "c", "d"]);
			expect(newGrid.col).toBe(focusGrid.col);
			expect(newGrid.row).toBe(focusGrid.row + 1);
		}
	});

	test("6 tiles (3x2): split top row → NEW below each", () => {
		for (const id of ["a", "b", "c"]) {
			const { focusGrid, newGrid } = simulateSplit(id, "vertical", ["a", "b", "c", "d", "e", "f"]);
			expect(newGrid.col).toBe(focusGrid.col);
			expect(newGrid.row).toBe(focusGrid.row + 1);
		}
	});
});
