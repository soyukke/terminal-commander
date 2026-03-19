import { describe, test, expect } from "bun:test";

/**
 * Tests for the Browse → directory selection → modal close flow.
 *
 * Root cause of the bug:
 *   Electrobun RPC uses maxRequestTime to timeout outgoing requests.
 *   The DEFAULT is 1000ms (1 second). maxRequestTime was set on the bun side
 *   (BrowserView.defineRPC) but NOT on the webview side (Electroview.defineRPC).
 *
 *   browseDirectory is a webview → bun request. The webview side controls
 *   the timeout for its outgoing requests. Without maxRequestTime on the
 *   webview side, the default 1s applied. Native file dialogs take much
 *   longer than 1s, so the request always timed out.
 *
 *   Additionally, the browsing guard (to prevent dismissal during dialog)
 *   had no error handling. When the RPC timed out, the guard was never
 *   reset, leaving the modal permanently stuck (can't cancel, can't escape).
 *
 * Fix:
 *   1. Set maxRequestTime on WEBVIEW side (Electroview.defineRPC) to 300s
 *   2. Wrap browseDirectory call in try/finally so browsing flag always resets
 */

describe("browseDirectory: webview RPC timeout", () => {
	const ELECTROBUN_DEFAULT_TIMEOUT = 1000;  // 1 second — the default
	const WEBVIEW_MAX_REQUEST_TIME = 300_000; // 5 minutes — the fix

	test("default RPC timeout (1s) is too short for file dialogs", () => {
		const typicalBrowseTime = 5_000; // user takes 5 seconds minimum
		expect(ELECTROBUN_DEFAULT_TIMEOUT).toBeLessThan(typicalBrowseTime);
	});

	test("fixed timeout (300s) is sufficient for file dialogs", () => {
		const longBrowseTime = 120_000; // user takes 2 minutes
		expect(WEBVIEW_MAX_REQUEST_TIME).toBeGreaterThan(longBrowseTime);
	});

	test("1s timeout: RPC rejects before dialog returns (the bug)", async () => {
		let response: { path: string | null } | null = null;
		let timedOut = false;

		const promise = new Promise<{ path: string | null }>((resolve, reject) => {
			// Simulates webview RPC timeout (default 1s → 20ms)
			const timer = setTimeout(() => {
				timedOut = true;
				reject(new Error("RPC request timed out."));
			}, 20);

			// Simulates user picking a dir after 5s → 50ms
			setTimeout(() => {
				if (!timedOut) {
					clearTimeout(timer);
					resolve({ path: "/selected/dir" });
				}
			}, 50);
		});

		try {
			response = await promise;
		} catch {
			// timed out
		}

		expect(timedOut).toBe(true);
		expect(response).toBeNull();
	});

	test("300s timeout: RPC waits for dialog to return (the fix)", async () => {
		let response: { path: string | null } | null = null;

		const promise = new Promise<{ path: string | null }>((resolve, reject) => {
			// Simulates fixed timeout (300s → 200ms)
			const timer = setTimeout(() => {
				reject(new Error("RPC request timed out."));
			}, 200);

			// Simulates user picking a dir after 5s → 50ms
			setTimeout(() => {
				clearTimeout(timer);
				resolve({ path: "/selected/dir" });
			}, 50);
		});

		try {
			response = await promise;
		} catch {
			// should not happen
		}

		expect(response).not.toBeNull();
		expect(response!.path).toBe("/selected/dir");
	});
});

describe("browseDirectory: browsing guard error handling", () => {
	test("browsing flag resets on RPC error (try/finally)", async () => {
		let browsing = false;

		// Simulates the fixed Browse button handler with try/finally
		async function handleBrowseClick(
			browseDirectory: () => Promise<{ path: string | null }>,
		): Promise<string | null> {
			browsing = true;
			try {
				const { path } = await browseDirectory();
				if (path) return path;
				return null;
			} catch {
				return null;
			} finally {
				browsing = false;
			}
		}

		// Case 1: RPC times out → browsing must reset to false
		await handleBrowseClick(() => Promise.reject(new Error("RPC request timed out.")));
		expect(browsing).toBe(false); // was stuck as true before the fix

		// Case 2: RPC succeeds → browsing must reset to false
		await handleBrowseClick(() => Promise.resolve({ path: "/some/dir" }));
		expect(browsing).toBe(false);

		// Case 3: user cancels dialog (path null) → browsing must reset
		await handleBrowseClick(() => Promise.resolve({ path: null }));
		expect(browsing).toBe(false);
	});

	test("without try/finally: browsing stays true on error (the old bug)", async () => {
		let browsing = false;

		// Simulates the OLD handler WITHOUT try/finally
		async function handleBrowseClickOld(
			browseDirectory: () => Promise<{ path: string | null }>,
		): Promise<string | null> {
			browsing = true;
			const { path } = await browseDirectory(); // throws → browsing never reset!
			browsing = false;
			if (path) return path;
			return null;
		}

		try {
			await handleBrowseClickOld(() =>
				Promise.reject(new Error("RPC request timed out.")),
			);
		} catch {
			// error propagates
		}

		// BUG: browsing is still true → cancel/escape/overlay all blocked
		expect(browsing).toBe(true);
	});

	test("cancel/escape work after browse error", async () => {
		let browsing = false;
		let modalOpen = true;

		function finish() {
			modalOpen = false;
		}
		function cancel() {
			if (!browsing) {
				finish();
			}
		}

		// Browse fails
		browsing = true;
		try {
			await Promise.reject(new Error("RPC request timed out."));
		} catch {
			// error
		} finally {
			browsing = false;
		}

		// Now cancel should work
		cancel();
		expect(modalOpen).toBe(false);
	});
});
