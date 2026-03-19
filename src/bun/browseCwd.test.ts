import { describe, test, expect, afterEach } from "bun:test";
import { PtyManager } from "./ptyManager.ts";
import { createTestPtyManager, waitFor, collectOutput, logContains } from "./testHelpers.ts";
import { DEFAULT_CONFIG, resolveConfig } from "../shared/config.ts";

/**
 * Integration test: simulates the full Browse → createTerminal → PTY flow
 * as closely as possible to the real RPC handlers in bun/index.ts.
 */

function createTestEnv() {
	const { manager, log } = createTestPtyManager();
	const config = resolveConfig({});
	return { manager, log, config };
}

/** Simulates the createTerminal RPC handler from bun/index.ts */
function simulateCreateTerminalRPC(
	manager: PtyManager,
	config: typeof DEFAULT_CONFIG,
	params: { cols: number; rows: number; command?: string; cwd?: string },
) {
	const { cols, rows, command, cwd } = params;
	const id = manager.create(cols, rows, {
		command,
		cwd: cwd || config["working-directory"] || undefined,
		env: config.env,
	});
	return { id };
}

/** Simulates the webview createTile logic that builds RPC params */
function simulateCreateTileParams(
	config: typeof DEFAULT_CONFIG,
	opts?: { command?: string; cwd?: string },
): { cols: number; rows: number; command?: string; cwd?: string } {
	const command = opts?.command ?? config.command;
	return { cols: 80, rows: 24, command, cwd: opts?.cwd };
}

/** Simulates JSON serialization in Electrobun RPC */
function simulateRPCSerialization<T>(data: T): T {
	return JSON.parse(JSON.stringify(data));
}

describe("Browse → cwd integration", () => {
	let manager: PtyManager;
	afterEach(() => manager?.closeAll());

	test("Browse picks /tmp → terminal runs in /tmp (full flow)", async () => {
		const env = createTestEnv();
		manager = env.manager;

		const params = simulateCreateTileParams(env.config, { cwd: "/tmp" });
		const serialized = simulateRPCSerialization(params);
		const { id } = simulateCreateTerminalRPC(manager, env.config, serialized);

		manager.write(id, "pwd\n");
		await waitFor(() => logContains(env.log, id, "/tmp"), 5000);
		expect(collectOutput(env.log, id)).toContain("/tmp");
	});

	test("Browse picks /var → terminal runs in /var (full flow)", async () => {
		const env = createTestEnv();
		manager = env.manager;

		const params = simulateCreateTileParams(env.config, { cwd: "/var" });
		const serialized = simulateRPCSerialization(params);
		const { id } = simulateCreateTerminalRPC(manager, env.config, serialized);

		manager.write(id, "pwd\n");
		await waitFor(() => logContains(env.log, id, "/var"), 5000);
		expect(collectOutput(env.log, id)).toContain("/var");
	});

	test("btn-add without Browse (cancel) → no cwd, uses default", async () => {
		const env = createTestEnv();
		manager = env.manager;

		const params = simulateCreateTileParams(env.config, {});
		const serialized = simulateRPCSerialization(params);
		expect(serialized.cwd).toBeUndefined();

		const { id } = simulateCreateTerminalRPC(manager, env.config, serialized);
		manager.write(id, "echo WORKS\n");
		await waitFor(() => logContains(env.log, id, "WORKS"), 5000);
	});

	test("btn-add Browse: command is config.command + cwd is browsed dir", () => {
		const env = createTestEnv();

		const params = simulateCreateTileParams(env.config, { cwd: "/tmp" });
		expect(params.command).toBe("claude");
		expect(params.cwd).toBe("/tmp");

		const serialized = simulateRPCSerialization(params);
		expect(serialized.command).toBe("claude");
		expect(serialized.cwd).toBe("/tmp");
	});

	test("RPC serialization preserves cwd string", () => {
		const params = { cols: 80, rows: 24, command: "claude", cwd: "/tmp/my-project" };
		const serialized = simulateRPCSerialization(params);
		expect(serialized.cwd).toBe("/tmp/my-project");
	});

	test("RPC serialization drops undefined cwd", () => {
		const params = { cols: 80, rows: 24, command: "claude", cwd: undefined };
		const serialized = simulateRPCSerialization(params);
		expect(serialized.cwd).toBeUndefined();
		expect("cwd" in serialized).toBe(false);
	});

	test("command with cwd: shell -c command runs in correct dir", async () => {
		const env = createTestEnv();
		manager = env.manager;

		const params = { cols: 80, rows: 24, command: "pwd", cwd: "/tmp" };
		const serialized = simulateRPCSerialization(params);
		const { id } = simulateCreateTerminalRPC(manager, env.config, serialized);

		await waitFor(() => logContains(env.log, id, "/tmp"), 5000);
		expect(collectOutput(env.log, id)).toContain("/tmp");
	});
});
