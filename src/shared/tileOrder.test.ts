import { describe, test, expect } from "bun:test";

// Test tile ordering logic in isolation (no module-level state dependency)

function createOrderedList() {
	const order: string[] = [];
	const map = new Map<string, { id: string }>();

	return {
		add(id: string, afterId?: string) {
			map.set(id, { id });
			if (afterId) {
				const idx = order.indexOf(afterId);
				if (idx !== -1) {
					order.splice(idx + 1, 0, id);
					return;
				}
			}
			order.push(id);
		},
		remove(id: string) {
			map.delete(id);
			const idx = order.indexOf(id);
			if (idx !== -1) order.splice(idx, 1);
		},
		getOrder: () => [...order],
		size: () => map.size,
	};
}

describe("tile ordering", () => {
	test("add tiles in sequence", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("c");
		expect(list.getOrder()).toEqual(["a", "b", "c"]);
	});

	test("add tile after specific tile", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("c");
		list.add("x", "a");
		expect(list.getOrder()).toEqual(["a", "x", "b", "c"]);
	});

	test("add tile after last tile", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("x", "b");
		expect(list.getOrder()).toEqual(["a", "b", "x"]);
	});

	test("add tile after nonexistent id appends to end", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("x", "nonexistent");
		expect(list.getOrder()).toEqual(["a", "b", "x"]);
	});

	test("add tile without afterId appends to end", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("x");
		expect(list.getOrder()).toEqual(["a", "b", "x"]);
	});

	test("remove tile from middle", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("c");
		list.remove("b");
		expect(list.getOrder()).toEqual(["a", "c"]);
		expect(list.size()).toBe(2);
	});

	test("remove first tile", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.remove("a");
		expect(list.getOrder()).toEqual(["b"]);
	});

	test("remove last tile", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.remove("b");
		expect(list.getOrder()).toEqual(["a"]);
	});

	test("remove nonexistent tile is no-op", () => {
		const list = createOrderedList();
		list.add("a");
		list.remove("x");
		expect(list.getOrder()).toEqual(["a"]);
		expect(list.size()).toBe(1);
	});

	test("multiple inserts after same tile maintain insertion order", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("x", "a"); // a, x, b
		list.add("y", "a"); // a, y, x, b
		expect(list.getOrder()).toEqual(["a", "y", "x", "b"]);
	});

	test("split-h scenario: insert after focused in sequence", () => {
		const list = createOrderedList();
		list.add("t1");
		list.add("t2");
		// Focus on t1, split-h → insert after t1
		list.add("t3", "t1");
		expect(list.getOrder()).toEqual(["t1", "t3", "t2"]);
		// Focus on t3, split-h again
		list.add("t4", "t3");
		expect(list.getOrder()).toEqual(["t1", "t3", "t4", "t2"]);
	});

	test("remove and re-add preserves correctness", () => {
		const list = createOrderedList();
		list.add("a");
		list.add("b");
		list.add("c");
		list.remove("b");
		list.add("d", "a");
		expect(list.getOrder()).toEqual(["a", "d", "c"]);
	});
});
