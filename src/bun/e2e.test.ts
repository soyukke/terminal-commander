import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestPtyManager, waitFor, type TestLog } from "./testHelpers.ts";
import type { PtyManager } from "./ptyManager.ts";

describe("RPC handler integration", () => {
	let manager: PtyManager;
	let log: TestLog;

	beforeAll(() => {
		({ manager, log } = createTestPtyManager());
	});

	afterAll(() => {
		manager.closeAll();
	});

	test("full lifecycle: create → write → read output → resize → close", async () => {
		const id = manager.create(80, 24);
		expect(id).toBeTruthy();

		expect(manager.write(id, "echo e2e-test-marker\n")).toBe(true);
		await waitFor(() =>
			log.outputs.some((o) => o.id === id && o.data.includes("e2e-test-marker"))
		);

		expect(manager.resize(id, 120, 40)).toBe(true);
		expect(manager.close(id)).toBe(true);
		expect(manager.close(id)).toBe(false);
	});

	test("multiple terminals run independently", async () => {
		const id1 = manager.create(80, 24);
		const id2 = manager.create(80, 24);

		manager.write(id1, "echo term1-marker\n");
		manager.write(id2, "echo term2-marker\n");

		await waitFor(() =>
			log.outputs.some((o) => o.id === id1 && o.data.includes("term1-marker")) &&
			log.outputs.some((o) => o.id === id2 && o.data.includes("term2-marker"))
		);

		manager.close(id1);
		manager.close(id2);
	});

	test("exit callback fires on process exit with correct code", async () => {
		const id = manager.create(80, 24);
		manager.write(id, "exit 42\n");
		await waitFor(() => log.exits.some((e) => e.id === id));

		const exitEntry = log.exits.find((e) => e.id === id)!;
		expect(exitEntry.exitCode).toBe(42);
	});

	test("close does not fire onExit callback", async () => {
		const id = manager.create(80, 24);
		manager.close(id);

		// Wait a bit to ensure onExit doesn't fire
		await new Promise((r) => setTimeout(r, 300));
		expect(log.exits.filter((e) => e.id === id).length).toBe(0);
	});
});
