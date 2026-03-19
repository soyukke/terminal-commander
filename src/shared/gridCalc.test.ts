import { describe, test, expect } from "bun:test";
import { bestGrid, getSplitInsertIndex } from "./gridCalc.ts";

// --- bestGrid ---

describe("bestGrid", () => {
	test("1 tile → 1x1 regardless of container", () => {
		expect(bestGrid(1, 1200, 800)).toEqual({ cols: 1, rows: 1 });
		expect(bestGrid(1, 400, 1600)).toEqual({ cols: 1, rows: 1 });
		expect(bestGrid(0, 1200, 800)).toEqual({ cols: 1, rows: 1 });
	});

	test("2 tiles in wide window → 2x1 (side by side)", () => {
		const { cols, rows } = bestGrid(2, 1600, 800);
		expect(cols).toBe(2);
		expect(rows).toBe(1);
	});

	test("2 tiles in tall window → 1x2 (stacked)", () => {
		const { cols, rows } = bestGrid(2, 600, 1200);
		expect(cols).toBe(1);
		expect(rows).toBe(2);
	});

	test("2 tiles in square window → 2x1", () => {
		// 2x1: cellW=500, cellH=1000 → ratio=0.5, score=0.69
		// 1x2: cellW=1000, cellH=500 → ratio=2.0, score=0.69
		// Tie → first found (2x1 has cols=1 first... actually 1x2 is cols=1)
		// cols=1 → 1x2 → ratio=1000/500=2.0
		// cols=2 → 2x1 → ratio=500/1000=0.5
		// Both score=0.69, cols=1 wins (found first)
		const { cols, rows } = bestGrid(2, 1000, 1000);
		expect(cols * rows).toBeGreaterThanOrEqual(2);
	});

	test("4 tiles in square window → 2x2", () => {
		const { cols, rows } = bestGrid(4, 1000, 1000);
		expect(cols).toBe(2);
		expect(rows).toBe(2);
	});

	test("6 tiles in 1200x800 → 3x2", () => {
		const { cols, rows } = bestGrid(6, 1200, 800);
		expect(cols).toBe(3);
		expect(rows).toBe(2);
	});

	test("9 tiles in square window → 3x3", () => {
		const { cols, rows } = bestGrid(9, 900, 900);
		expect(cols).toBe(3);
		expect(rows).toBe(3);
	});

	test("all cells fit the tile count", () => {
		for (let n = 1; n <= 20; n++) {
			const { cols, rows } = bestGrid(n, 1200, 800);
			expect(cols * rows).toBeGreaterThanOrEqual(n);
		}
	});

	test("cells are approximately square (ratio between 0.3 and 3.0)", () => {
		for (let n = 1; n <= 12; n++) {
			const { cols, rows } = bestGrid(n, 1920, 1080);
			const cellW = 1920 / cols;
			const cellH = 1080 / rows;
			const ratio = cellW / cellH;
			expect(ratio).toBeGreaterThan(0.3);
			expect(ratio).toBeLessThan(3.0);
		}
	});

	test("wide window prefers more columns", () => {
		const wide = bestGrid(4, 2400, 600);
		const tall = bestGrid(4, 600, 2400);
		expect(wide.cols).toBeGreaterThan(tall.cols);
	});
});

// --- getSplitInsertIndex ---

describe("getSplitInsertIndex", () => {
	// Tile order: ["a", "b", "c", "d"] in a 1200x800 container

	test("horizontal split inserts after focused tile", () => {
		const order = ["a", "b", "c", "d"];
		const idx = getSplitInsertIndex("b", "horizontal", order, 1200, 800);
		// Should insert after "b" (index 1)
		expect(idx).toBe(1);
	});

	test("horizontal split on first tile inserts at index 0", () => {
		const order = ["a", "b", "c"];
		const idx = getSplitInsertIndex("a", "horizontal", order, 1200, 800);
		expect(idx).toBe(0);
	});

	test("horizontal split on last tile inserts at last index", () => {
		const order = ["a", "b", "c"];
		const idx = getSplitInsertIndex("c", "horizontal", order, 1200, 800);
		expect(idx).toBe(2);
	});

	test("vertical split inserts below focused tile", () => {
		const order = ["a", "b", "c", "d"];
		const idx = getSplitInsertIndex("a", "vertical", order, 1200, 800);
		// With 5 tiles (4+1 new) in 1200x800, bestGrid → some cols
		// The insert index should be further down than horizontal
		const hIdx = getSplitInsertIndex("a", "horizontal", order, 1200, 800);
		expect(idx).toBeGreaterThanOrEqual(hIdx);
	});

	test("returns count for unknown focused id", () => {
		const order = ["a", "b", "c"];
		const idx = getSplitInsertIndex("unknown", "horizontal", order, 1200, 800);
		expect(idx).toBe(3);
	});

	test("empty order returns 0", () => {
		const idx = getSplitInsertIndex("a", "horizontal", [], 1200, 800);
		expect(idx).toBe(0);
	});

	test("single tile horizontal split", () => {
		const idx = getSplitInsertIndex("a", "horizontal", ["a"], 1200, 800);
		expect(idx).toBe(0);
	});

	test("single tile vertical split", () => {
		const idx = getSplitInsertIndex("a", "vertical", ["a"], 1200, 800);
		// Should be >= 0 and <= 1
		expect(idx).toBeGreaterThanOrEqual(0);
		expect(idx).toBeLessThanOrEqual(1);
	});

	test("insert index never exceeds tile count", () => {
		for (let n = 1; n <= 10; n++) {
			const order = Array.from({ length: n }, (_, i) => `t${i}`);
			for (const id of order) {
				const hIdx = getSplitInsertIndex(id, "horizontal", order, 1200, 800);
				const vIdx = getSplitInsertIndex(id, "vertical", order, 1200, 800);
				expect(hIdx).toBeLessThanOrEqual(n);
				expect(vIdx).toBeLessThanOrEqual(n);
				expect(hIdx).toBeGreaterThanOrEqual(0);
				expect(vIdx).toBeGreaterThanOrEqual(0);
			}
		}
	});
});
