import { PtyManager } from "./ptyManager.ts";

export interface TestLog {
	outputs: { id: string; data: string }[];
	exits: { id: string; exitCode: number }[];
}

export function createTestPtyManager(): { manager: PtyManager; log: TestLog } {
	const log: TestLog = { outputs: [], exits: [] };
	const manager = new PtyManager({
		onOutput: (id, data) => log.outputs.push({ id, data }),
		onExit: (id, exitCode) => log.exits.push({ id, exitCode }),
	});
	return { manager, log };
}

export async function waitFor(
	predicate: () => boolean,
	timeout = 3000,
	interval = 50
): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeout) {
			throw new Error(`waitFor timed out after ${timeout}ms`);
		}
		await new Promise((r) => setTimeout(r, interval));
	}
}
