import { describe, test, expect } from "bun:test";
import {
	parseCombo,
	matchesEvent,
	resolveKeybindings,
	makeXtermKeyHandler,
	DEFAULT_KEYBINDS,
} from "./keybindings.ts";

function fakeEvent(
	opts: Partial<{
		key: string;
		ctrlKey: boolean;
		shiftKey: boolean;
		altKey: boolean;
		metaKey: boolean;
		type: string;
	}>,
): KeyboardEvent {
	return {
		key: opts.key ?? "",
		ctrlKey: opts.ctrlKey ?? false,
		shiftKey: opts.shiftKey ?? false,
		altKey: opts.altKey ?? false,
		metaKey: opts.metaKey ?? false,
		type: opts.type ?? "keydown",
	} as unknown as KeyboardEvent;
}

describe("parseCombo", () => {
	test("parses modifier+key combos", () => {
		expect(parseCombo("t")).toEqual({ ctrl: false, shift: false, alt: false, meta: false, key: "t" });
		expect(parseCombo("ctrl+shift+t")).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: "t" });
		expect(parseCombo("ctrl+shift+alt+meta+x")).toEqual({ ctrl: true, shift: true, alt: true, meta: true, key: "x" });
	});

	test("parses arrow keys", () => {
		expect(parseCombo("ctrl+shift+arrowleft")!.key).toBe("arrowleft");
	});

	test("is case insensitive and trims whitespace", () => {
		expect(parseCombo("Ctrl + Shift + T")).toEqual(parseCombo("ctrl+shift+t"));
	});

	test("supports cmd/super aliases for meta", () => {
		expect(parseCombo("cmd+t")!.meta).toBe(true);
		expect(parseCombo("super+t")!.meta).toBe(true);
	});

	test("returns null for invalid combos", () => {
		expect(parseCombo("")).toBeNull();
		expect(parseCombo("ctrl+shift")).toBeNull(); // no key
		expect(parseCombo("ctrl+a+b")).toBeNull(); // multiple keys
	});
});

describe("matchesEvent", () => {
	test("matches exact combo", () => {
		const combo = parseCombo("ctrl+shift+t")!;
		expect(matchesEvent(combo, fakeEvent({ key: "T", ctrlKey: true, shiftKey: true }))).toBe(true);
	});

	test("rejects mismatched modifier or key", () => {
		const combo = parseCombo("ctrl+shift+t")!;
		expect(matchesEvent(combo, fakeEvent({ key: "T", ctrlKey: true }))).toBe(false); // missing shift
		expect(matchesEvent(combo, fakeEvent({ key: "W", ctrlKey: true, shiftKey: true }))).toBe(false); // wrong key
	});

	test("rejects extra modifiers", () => {
		const combo = parseCombo("ctrl+t")!;
		expect(matchesEvent(combo, fakeEvent({ key: "T", ctrlKey: true, shiftKey: true }))).toBe(false);
	});
});

describe("resolveKeybindings", () => {
	test("returns all defaults with empty config", () => {
		const map = resolveKeybindings({});
		expect(map.size).toBe(Object.keys(DEFAULT_KEYBINDS).length);
		for (const action of Object.values(DEFAULT_KEYBINDS)) {
			expect(map.has(action)).toBe(true);
		}
	});

	test("user config overrides default combo", () => {
		const map = resolveKeybindings({ "ctrl+shift+n": "new_tile" });
		expect(map.get("new_tile")!.key).toBe("n");
	});

	test("user config adds custom actions", () => {
		const map = resolveKeybindings({ "ctrl+shift+x": "custom_action" });
		expect(map.has("custom_action")).toBe(true);
		expect(map.has("new_tile")).toBe(true); // defaults preserved
	});

	test("skips invalid combo strings", () => {
		expect(resolveKeybindings({ "": "bad" }).has("bad")).toBe(false);
	});
});

describe("makeXtermKeyHandler", () => {
	function setup() {
		const map = resolveKeybindings({});
		const dispatched: string[] = [];
		const handler = makeXtermKeyHandler(map, (action) => dispatched.push(action));
		return { handler, dispatched };
	}

	test("dispatches matching action and blocks xterm", () => {
		const { handler, dispatched } = setup();
		expect(handler(fakeEvent({ key: "t", metaKey: true }))).toBe(false);
		expect(dispatched).toEqual(["new_tile"]);
	});

	test("passes through non-matching keys", () => {
		const { handler, dispatched } = setup();
		expect(handler(fakeEvent({ key: "a" }))).toBe(true);
		expect(dispatched).toEqual([]);
	});

	test("ignores keyup events", () => {
		const { handler, dispatched } = setup();
		expect(handler(fakeEvent({ key: "T", ctrlKey: true, shiftKey: true, type: "keyup" }))).toBe(true);
		expect(dispatched).toEqual([]);
	});
});
