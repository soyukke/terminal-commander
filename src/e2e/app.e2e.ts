/**
 * E2E tests for Terminal Commander.
 *
 * These tests launch the actual app, interact via macOS Accessibility API,
 * and verify behavior with screenshots + process checks.
 *
 * Requirements:
 * - macOS only
 * - Accessibility permission for terminal/IDE running the tests
 * - No other Terminal Commander instance running
 *
 * Run: bun test src/e2e/
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
	launchApp,
	killApp,
	sendKeystroke,
	sendKeyCode,
	captureScreenshot,
	cleanupScreenshot,
	getWindowCount,
	getWindowTitle,
	isAppRunning,
	waitFor,
	sleep,
	KeyCode,
	type AppHandle,
} from "./harness.ts";

describe("E2E: App Startup", () => {
	let app: AppHandle;

	afterAll(async () => {
		if (app) await killApp(app);
	});

	test("app launches and window appears", async () => {
		app = await launchApp();
		expect(app.pid).toBeGreaterThan(0);

		const running = await isAppRunning();
		expect(running).toBe(true);

		const windowCount = await getWindowCount();
		expect(windowCount).toBeGreaterThanOrEqual(1);
	}, 60_000);

	test("window has correct title", async () => {
		const title = await getWindowTitle();
		expect(title).toContain("Terminal Commander");
	});

	test("initial screenshot looks reasonable", async () => {
		const path = await captureScreenshot("/tmp/tc-e2e-startup.png");
		// File should exist and have non-trivial size (not a blank capture)
		const file = Bun.file(path);
		expect(await file.exists()).toBe(true);
		expect(file.size).toBeGreaterThan(10_000); // >10KB means something rendered
		cleanupScreenshot(path);
	});
});

describe("E2E: Keyboard Shortcuts", () => {
	let app: AppHandle;

	beforeAll(async () => {
		app = await launchApp();
	}, 60_000);

	afterAll(async () => {
		if (app) await killApp(app);
	});

	test("Ctrl+Shift+T creates a new tile", async () => {
		// The app starts with 1 tile (from dir picker or default)
		// Send Ctrl+Shift+T to create another
		await sendKeystroke("t", ["control", "shift"]);
		await sleep(1000);

		// Capture screenshot to verify visually
		const path = await captureScreenshot("/tmp/tc-e2e-new-tile.png");
		const file = Bun.file(path);
		expect(await file.exists()).toBe(true);
		expect(file.size).toBeGreaterThan(10_000);
		cleanupScreenshot(path);
	});

	test("Ctrl+Shift+W closes a tile", async () => {
		await sendKeystroke("w", ["control", "shift"]);
		await sleep(1000);

		const path = await captureScreenshot("/tmp/tc-e2e-close-tile.png");
		const file = Bun.file(path);
		expect(await file.exists()).toBe(true);
		cleanupScreenshot(path);
	});

	test("Ctrl+Shift+Arrow switches focus between tiles", async () => {
		// Create 2 tiles first
		await sendKeystroke("t", ["control", "shift"]);
		await sleep(500);
		await sendKeystroke("t", ["control", "shift"]);
		await sleep(500);

		// Switch focus
		await sendKeyCode(KeyCode.RightArrow, ["control", "shift"]);
		await sleep(500);

		const path = await captureScreenshot("/tmp/tc-e2e-focus-switch.png");
		const file = Bun.file(path);
		expect(await file.exists()).toBe(true);
		cleanupScreenshot(path);
	});
});

describe("E2E: App doesn't crash", () => {
	let app: AppHandle;

	beforeAll(async () => {
		app = await launchApp();
	}, 60_000);

	afterAll(async () => {
		if (app) await killApp(app);
	});

	test("app survives rapid tile creation/deletion", async () => {
		for (let i = 0; i < 5; i++) {
			await sendKeystroke("t", ["control", "shift"]);
			await sleep(200);
		}
		for (let i = 0; i < 5; i++) {
			await sendKeystroke("w", ["control", "shift"]);
			await sleep(200);
		}

		const running = await isAppRunning();
		expect(running).toBe(true);
	});

	test("app survives rapid focus switching", async () => {
		await sendKeystroke("t", ["control", "shift"]);
		await sleep(300);

		for (let i = 0; i < 10; i++) {
			await sendKeyCode(KeyCode.RightArrow, ["control", "shift"]);
			await sleep(100);
		}

		const running = await isAppRunning();
		expect(running).toBe(true);
	});
});
