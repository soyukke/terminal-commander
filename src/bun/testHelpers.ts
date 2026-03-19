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

export function collectOutput(log: TestLog, id: string): string {
	return log.outputs
		.filter((o) => o.id === id)
		.map((o) => o.data)
		.join("");
}

export function logContains(log: TestLog, id: string, text: string): boolean {
	return log.outputs.some((o) => o.id === id && o.data.includes(text));
}

export async function waitFor(
	predicate: () => boolean,
	timeout = 5000,
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
