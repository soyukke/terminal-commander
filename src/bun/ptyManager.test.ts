import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestPtyManager, waitFor, type TestLog } from "./testHelpers.ts";
import type { PtyManager } from "./ptyManager.ts";

describe("PtyManager", () => {
	let manager: PtyManager;
	let log: TestLog;

	beforeEach(() => {
		({ manager, log } = createTestPtyManager());
	});

	afterEach(() => {
		manager.closeAll();
	});

	test("create returns an id", () => {
		const id = manager.create(80, 24);
		expect(id).toStartWith("term-");
	});

	test("create returns unique ids", () => {
		const id1 = manager.create(80, 24);
		const id2 = manager.create(80, 24);
		expect(id1).not.toBe(id2);
	});

	test("write to valid session returns true", () => {
		const id = manager.create(80, 24);
		expect(manager.write(id, "echo hello\n")).toBe(true);
	});

	test("write to invalid session returns false", () => {
		expect(manager.write("nonexistent", "data")).toBe(false);
	});

	test("resize valid session returns true", () => {
		const id = manager.create(80, 24);
		expect(manager.resize(id, 120, 40)).toBe(true);
	});

	test("resize invalid session returns false", () => {
		expect(manager.resize("nonexistent", 120, 40)).toBe(false);
	});

	test("close valid session returns true", () => {
		const id = manager.create(80, 24);
		expect(manager.close(id)).toBe(true);
	});

	test("close invalid session returns false", () => {
		expect(manager.close("nonexistent")).toBe(false);
	});

	test("close same session twice returns false on second call", () => {
		const id = manager.create(80, 24);
		expect(manager.close(id)).toBe(true);
		expect(manager.close(id)).toBe(false);
	});

	test("onOutput callback receives terminal data", async () => {
		const id = manager.create(80, 24);
		manager.write(id, "echo test-output-marker\n");
		await waitFor(() =>
			log.outputs.some((o) => o.id === id && o.data.includes("test-output-marker"))
		);
	});

	test("onExit callback fires when process exits", async () => {
		const id = manager.create(80, 24);
		manager.write(id, "exit 0\n");
		await waitFor(() => log.exits.some((e) => e.id === id));
	});

	test("create with command runs the specified command", async () => {
		const id = manager.create(80, 24, { command: "echo cmd-test-marker" });
		await waitFor(() =>
			log.outputs.some((o) => o.id === id && o.data.includes("cmd-test-marker"))
		);
	});

	test("create with command exits after command completes", async () => {
		const id = manager.create(80, 24, { command: "echo done" });
		await waitFor(() => log.exits.some((e) => e.id === id));
	});
});
