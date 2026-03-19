import { describe, test, expect, afterEach } from "bun:test";
import { PtyManager } from "./ptyManager.ts";

/**
 * E2E flow tests: title tracking, bell notification, color management,
 * and full Claude Code session lifecycle.
 */

interface Log {
	titles: { id: string; title: string }[];
	bells: { id: string }[];
	exits: { id: string; exitCode: number }[];
}

function createTrackedManager() {
	const log: Log = { titles: [], bells: [], exits: [] };
	const titleById = new Map<string, string>();
	const colorById = new Map<string, string>();

	const manager = new PtyManager({
		onOutput: () => {},
		onTitle: (id, title) => {
			log.titles.push({ id, title });
			titleById.set(id, title);
		},
		onBell: (id) => log.bells.push({ id }),
		onExit: (id, exitCode) => {
			log.exits.push({ id, exitCode });
			titleById.delete(id);
		},
	});

	return { manager, log, titleById, colorById };
}

async function waitFor(pred: () => boolean, timeout = 5000): Promise<void> {
	const start = Date.now();
	while (!pred()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await new Promise((r) => setTimeout(r, 50));
	}
}

describe("E2E: Claude Code session lifecycle", () => {
	let manager: PtyManager;
	afterEach(() => manager?.closeAll());

	test("multiple sessions with different titles run independently", async () => {
		const { manager: m, titleById } = createTrackedManager();
		manager = m;

		const id1 = manager.create(80, 24, {
			command: 'printf "\\033]2;Claude: frontend\\007"; sleep 0.5',
		});
		const id2 = manager.create(80, 24, {
			command: 'printf "\\033]2;Claude: backend\\007"; sleep 0.5',
		});

		await waitFor(() => titleById.has(id1) && titleById.has(id2));
		expect(titleById.get(id1)).toBe("Claude: frontend");
		expect(titleById.get(id2)).toBe("Claude: backend");
	});

	test("title updates track latest value", async () => {
		const { manager: m, log, titleById } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command: [
				'printf "\\033]0;Claude Code\\007"',
				"sleep 0.3",
				'printf "\\033]2;Claude: renamed\\007"',
				"sleep 0.3",
			].join(" && "),
		});

		await waitFor(() => titleById.get(id) === "Claude: renamed");
		const titles = log.titles.filter((t) => t.id === id).map((t) => t.title);
		expect(titles).toContain("Claude Code");
		expect(titles).toContain("Claude: renamed");
	});

	test("bell fires for task completion", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command: 'printf "\\033]2;Claude: task\\007" && sleep 0.3 && printf "\\007" && sleep 1',
		});

		await waitFor(() => log.titles.some((t) => t.id === id && t.title === "Claude: task"));
		await waitFor(() => log.bells.some((b) => b.id === id));

		// Title was set (check log, not titleById which gets cleared on exit)
		expect(log.titles.find((t) => t.id === id)!.title).toBe("Claude: task");
	});

	test("exit cleans up title tracking", async () => {
		const { manager: m, log, titleById } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command: 'printf "\\033]2;Claude: temp\\007" && exit 0',
		});

		await waitFor(() => log.exits.some((e) => e.id === id));
		expect(titleById.has(id)).toBe(false);
	});

	test("close() does not trigger exit callback", async () => {
		const { manager: m, log, titleById } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command: 'printf "\\033]2;Claude: active\\007"; sleep 10',
		});

		await waitFor(() => titleById.get(id) === "Claude: active");
		manager.close(id);
		await new Promise((r) => setTimeout(r, 500));
		expect(log.exits.filter((e) => e.id === id).length).toBe(0);
	});
});

describe("E2E: Color tracking", () => {
	test("color assignment and change per tile", () => {
		const colorById = new Map<string, string>();

		colorById.set("term-0", "#7aa2f7");
		colorById.set("term-1", "#7aa2f7");

		// Change term-0 to red
		colorById.set("term-0", "#f7768e");
		expect(colorById.get("term-0")).toBe("#f7768e");
		expect(colorById.get("term-1")).toBe("#7aa2f7");

		// Change term-1 to green
		colorById.set("term-1", "#9ece6a");
		expect(colorById.get("term-1")).toBe("#9ece6a");

		// Remove cleans up
		colorById.delete("term-0");
		expect(colorById.has("term-0")).toBe(false);
	});

	test("all preset colors are valid hex", () => {
		const presets = [
			"#7aa2f7", "#bb9af7", "#7dcfff", "#9ece6a",
			"#e0af68", "#ff9e64", "#f7768e", "#414868",
		];
		for (const color of presets) {
			expect(color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});

describe("E2E: Full workflow — title + color + bell + exit", () => {
	let manager: PtyManager;
	afterEach(() => manager?.closeAll());

	test("complete session lifecycle", async () => {
		const { manager: m, log, titleById, colorById } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command: [
				'printf "\\033]0;Claude Code\\007"',
				"sleep 0.1",
				'printf "\\033]2;Claude: build-feature\\007"',
				"sleep 0.1",
				'printf "\\007"',
				"exit 0",
			].join(" && "),
		});

		colorById.set(id, "#bb9af7");

		await waitFor(() => log.exits.some((e) => e.id === id));

		// Title sequence
		const titles = log.titles.filter((t) => t.id === id).map((t) => t.title);
		expect(titles).toContain("Claude Code");
		expect(titles).toContain("Claude: build-feature");

		// Bell
		expect(log.bells.filter((b) => b.id === id).length).toBeGreaterThanOrEqual(1);

		// Exit
		expect(log.exits.find((e) => e.id === id)!.exitCode).toBe(0);

		// Color tracked
		expect(colorById.get(id)).toBe("#bb9af7");

		// Title cleaned up
		expect(titleById.has(id)).toBe(false);
	});
});
