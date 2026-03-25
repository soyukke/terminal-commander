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

// Test prev/next navigation logic in isolation

function createNavList() {
	const order: string[] = [];
	let focusedId: string | null = null;

	return {
		add(id: string) {
			order.push(id);
		},
		setFocused(id: string | null) {
			focusedId = id;
		},
		getPrev(): string | null {
			if (order.length === 0 || focusedId === null) return null;
			const idx = order.indexOf(focusedId);
			if (idx === -1) return order[0];
			if (idx === 0) return order[order.length - 1];
			return order[idx - 1];
		},
		getNext(): string | null {
			if (order.length === 0 || focusedId === null) return null;
			const idx = order.indexOf(focusedId);
			if (idx === -1 || idx >= order.length - 1) return order[0];
			return order[idx + 1];
		},
	};
}

describe("tile navigation (prev/next)", () => {
	test("returns null when no tiles or no focus", () => {
		const empty = createNavList();
		empty.setFocused("a");
		expect(empty.getPrev()).toBeNull();
		expect(empty.getNext()).toBeNull();

		const noFocus = createNavList();
		noFocus.add("a");
		noFocus.setFocused(null);
		expect(noFocus.getPrev()).toBeNull();
		expect(noFocus.getNext()).toBeNull();
	});

	test("navigates and wraps around", () => {
		const nav = createNavList();
		nav.add("a");
		nav.add("b");
		nav.add("c");

		nav.setFocused("a");
		expect(nav.getNext()).toBe("b");
		expect(nav.getPrev()).toBe("c"); // wraps backward

		nav.setFocused("c");
		expect(nav.getNext()).toBe("a"); // wraps forward
		expect(nav.getPrev()).toBe("b");
	});

	test("single tile wraps to itself", () => {
		const nav = createNavList();
		nav.add("a");
		nav.setFocused("a");
		expect(nav.getPrev()).toBe("a");
		expect(nav.getNext()).toBe("a");
	});

	test("focused tile not in order returns first tile", () => {
		const nav = createNavList();
		nav.add("a");
		nav.add("b");
		nav.setFocused("nonexistent");
		expect(nav.getPrev()).toBe("a");
		expect(nav.getNext()).toBe("a");
	});
});
