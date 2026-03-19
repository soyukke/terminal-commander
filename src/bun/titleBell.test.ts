import { describe, test, expect, afterEach } from "bun:test";
import { PtyManager } from "./ptyManager.ts";

function createTrackedManager() {
	const log = {
		outputs: [] as { id: string; data: string }[],
		titles: [] as { id: string; title: string }[],
		bells: [] as { id: string }[],
		exits: [] as { id: string; exitCode: number }[],
	};
	const manager = new PtyManager({
		onOutput: (id, data) => log.outputs.push({ id, data }),
		onTitle: (id, title) => log.titles.push({ id, title }),
		onBell: (id) => log.bells.push({ id }),
		onExit: (id, exitCode) => log.exits.push({ id, exitCode }),
	});
	return { manager, log };
}

async function waitFor(
	predicate: () => boolean,
	timeout = 5000,
	interval = 50,
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeout) {
			throw new Error(`waitFor timed out after ${timeout}ms`);
		}
		await new Promise((r) => setTimeout(r, interval));
	}
}

describe("OSC title detection via PTY", () => {
	let manager: PtyManager;

	afterEach(() => {
		manager?.closeAll();
	});

	test("detects OSC 0 title from echo command", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		// Simulate Claude Code setting terminal title via OSC 0
		const id = manager.create(80, 24, {
			command: 'printf "\\033]0;Claude Code\\007"',
		});

		await waitFor(() => log.titles.some((t) => t.id === id && t.title === "Claude Code"));
		expect(log.titles.find((t) => t.id === id)!.title).toBe("Claude Code");
	});

	test("detects OSC 2 title (session rename)", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		// Simulate Claude Code /rename setting OSC 2
		const id = manager.create(80, 24, {
			command: 'printf "\\033]2;Claude: my-session\\007"',
		});

		await waitFor(() =>
			log.titles.some((t) => t.id === id && t.title === "Claude: my-session"),
		);
		expect(log.titles.find((t) => t.id === id)!.title).toBe("Claude: my-session");
	});

	test("detects title update (title changes over time)", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command:
				'printf "\\033]0;First Title\\007"; sleep 0.2; printf "\\033]0;Second Title\\007"',
		});

		await waitFor(() => log.titles.some((t) => t.title === "Second Title"));

		const titles = log.titles.filter((t) => t.id === id).map((t) => t.title);
		expect(titles).toContain("First Title");
		expect(titles).toContain("Second Title");
	});
});

describe("BEL detection via PTY", () => {
	let manager: PtyManager;

	afterEach(() => {
		manager?.closeAll();
	});

	test("detects standalone BEL character", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, {
			command: 'printf "\\007"',
		});

		await waitFor(() => log.bells.some((b) => b.id === id));
		expect(log.bells.filter((b) => b.id === id).length).toBeGreaterThanOrEqual(1);
	});

	test("BEL inside OSC terminator is NOT counted as bell", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		// OSC title with BEL terminator — should NOT trigger bell
		const id = manager.create(80, 24, {
			command: 'printf "\\033]0;Title Only\\007"',
		});

		await waitFor(() => log.titles.some((t) => t.id === id));

		// Give extra time to ensure no bell fires
		await new Promise((r) => setTimeout(r, 300));
		expect(log.bells.filter((b) => b.id === id).length).toBe(0);
	});

	test("BEL after OSC title IS counted as bell", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		// OSC title followed by standalone BEL
		const id = manager.create(80, 24, {
			command: 'printf "\\033]0;Title\\007\\007"',
		});

		await waitFor(() => log.titles.some((t) => t.id === id));
		await waitFor(() => log.bells.some((b) => b.id === id));
	});
});

describe("Process exit notification", () => {
	let manager: PtyManager;

	afterEach(() => {
		manager?.closeAll();
	});

	test("onExit fires with correct exit code", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, { command: "exit 0" });
		await waitFor(() => log.exits.some((e) => e.id === id));
		expect(log.exits.find((e) => e.id === id)!.exitCode).toBe(0);
	});

	test("onExit fires with non-zero exit code", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24, { command: "exit 42" });
		await waitFor(() => log.exits.some((e) => e.id === id));
		expect(log.exits.find((e) => e.id === id)!.exitCode).toBe(42);
	});

	test("close() does not trigger onExit", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		const id = manager.create(80, 24);
		manager.close(id);

		await new Promise((r) => setTimeout(r, 500));
		expect(log.exits.filter((e) => e.id === id).length).toBe(0);
	});
});

describe("Combined: title + bell + exit (simulates Claude Code workflow)", () => {
	let manager: PtyManager;

	afterEach(() => {
		manager?.closeAll();
	});

	test("full Claude Code simulation: set title, work, bell on complete, then exit", async () => {
		const { manager: m, log } = createTrackedManager();
		manager = m;

		// Simulate: Claude Code starts → sets title → does work → sends bell → exits
		const id = manager.create(80, 24, {
			command: [
				'printf "\\033]0;Claude Code\\007"',
				"sleep 0.1",
				'printf "\\033]2;Claude: my-task\\007"',
				"sleep 0.1",
				'printf "\\007"', // bell on task complete
				"exit 0",
			].join(" && "),
		});

		// Title should be set
		await waitFor(() => log.titles.some((t) => t.title === "Claude: my-task"));

		// Bell should fire
		await waitFor(() => log.bells.some((b) => b.id === id));

		// Process should exit
		await waitFor(() => log.exits.some((e) => e.id === id));

		// Verify full sequence
		const titles = log.titles.filter((t) => t.id === id).map((t) => t.title);
		expect(titles).toContain("Claude Code");
		expect(titles).toContain("Claude: my-task");
		expect(log.bells.filter((b) => b.id === id).length).toBeGreaterThanOrEqual(1);
		expect(log.exits.find((e) => e.id === id)!.exitCode).toBe(0);
	});
});
