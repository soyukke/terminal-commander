import { describe, test, expect } from "bun:test";

/**
 * Tests for the dirPickerModal browse guard state machine.
 *
 * The guard prevents overlay click / Escape / Cancel from dismissing the modal
 * while the native file dialog is open. The critical fix: try/finally ensures
 * browsing always resets, even on RPC timeout.
 */

/** Reproduces the state machine from dirPickerModal.ts */
function createModalStateMachine() {
	let resolved = false;
	let browsing = false;
	let result: string | null | undefined = undefined;

	const finish = (val: string | null) => {
		if (resolved) return;
		resolved = true;
		result = val;
	};

	return {
		/** Simulate clicking Browse → calls rpc.request.browseDirectory */
		async browse(
			rpcCall: () => Promise<{ path: string | null }>,
		) {
			browsing = true;
			try {
				const { path } = await rpcCall();
				if (path) finish(path);
			} catch {
				// RPC timeout or error
			} finally {
				browsing = false;
			}
		},
		clickOverlay: () => { if (!browsing) finish(null); },
		pressEscape: () => { if (!browsing) finish(null); },
		clickCancel: () => { if (!browsing) finish(null); },
		clickRecentDir: (dir: string) => { finish(dir); },
		get result() { return result; },
		get isResolved() { return resolved; },
		get isBrowsing() { return browsing; },
	};
}

describe("dirPickerModal: browse guard", () => {
	test("Browse → select path → modal closes", async () => {
		const sm = createModalStateMachine();
		await sm.browse(() => Promise.resolve({ path: "/Users/test/project" }));
		expect(sm.result).toBe("/Users/test/project");
		expect(sm.isResolved).toBe(true);
		expect(sm.isBrowsing).toBe(false);
	});

	test("Browse → cancel dialog → modal stays open, browsing resets", async () => {
		const sm = createModalStateMachine();
		await sm.browse(() => Promise.resolve({ path: null }));
		expect(sm.isResolved).toBe(false);
		expect(sm.isBrowsing).toBe(false); // critical: must reset
	});

	test("Browse → RPC timeout → browsing resets, user can cancel", async () => {
		const sm = createModalStateMachine();
		await sm.browse(() => Promise.reject(new Error("RPC request timed out.")));

		// browsing must be false so user can escape
		expect(sm.isBrowsing).toBe(false);
		expect(sm.isResolved).toBe(false);

		// now cancel works
		sm.clickCancel();
		expect(sm.isResolved).toBe(true);
		expect(sm.result).toBeNull();
	});

	test("overlay click during Browse is blocked", async () => {
		let resolveRpc: (v: { path: string | null }) => void;
		const rpcPromise = new Promise<{ path: string | null }>((r) => { resolveRpc = r; });

		const browsePromise = createModalStateMachine();
		const sm = browsePromise;

		// Start browse (dialog "open")
		const browseTask = sm.browse(() => rpcPromise);

		// While dialog is open, overlay click should be blocked
		sm.clickOverlay();
		expect(sm.isResolved).toBe(false);

		// Dialog returns
		resolveRpc!({ path: "/selected/dir" });
		await browseTask;

		expect(sm.result).toBe("/selected/dir");
		expect(sm.isBrowsing).toBe(false);
	});

	test("Escape during Browse is blocked", async () => {
		let resolveRpc: (v: { path: string | null }) => void;
		const rpcPromise = new Promise<{ path: string | null }>((r) => { resolveRpc = r; });
		const sm = createModalStateMachine();

		const browseTask = sm.browse(() => rpcPromise);
		sm.pressEscape();
		expect(sm.isResolved).toBe(false);

		resolveRpc!({ path: "/escape/test" });
		await browseTask;
		expect(sm.result).toBe("/escape/test");
	});

	test("Cancel during Browse is blocked", async () => {
		let resolveRpc: (v: { path: string | null }) => void;
		const rpcPromise = new Promise<{ path: string | null }>((r) => { resolveRpc = r; });
		const sm = createModalStateMachine();

		const browseTask = sm.browse(() => rpcPromise);
		sm.clickCancel();
		expect(sm.isResolved).toBe(false);

		resolveRpc!({ path: "/cancel/test" });
		await browseTask;
		expect(sm.result).toBe("/cancel/test");
	});

	test("recent dir click works normally", () => {
		const sm = createModalStateMachine();
		sm.clickRecentDir("/home/user/project");
		expect(sm.result).toBe("/home/user/project");
	});

	test("overlay click without Browse cancels normally", () => {
		const sm = createModalStateMachine();
		sm.clickOverlay();
		expect(sm.result).toBeNull();
	});

	test("Escape without Browse cancels normally", () => {
		const sm = createModalStateMachine();
		sm.pressEscape();
		expect(sm.result).toBeNull();
	});
});
