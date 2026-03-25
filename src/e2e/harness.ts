/**
 * E2E test harness for Terminal Commander.
 *
 * Uses macOS Accessibility API (osascript) + screencapture
 * because Electrobun's WKWebView doesn't support CDP/Playwright.
 */
import { spawn, type Subprocess } from "bun";
import { unlinkSync, existsSync } from "fs";

const APP_NAME = "Terminal Commander";
const STARTUP_MARKER = "Terminal Commander started!";
const DEFAULT_TIMEOUT = 30_000;
const PROJECT_DIR = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

export interface AppHandle {
	proc: Subprocess;
	pid: number;
	log: string[];
}

/** Launch the app and wait for the startup marker in stdout. */
export async function launchApp(timeoutMs = DEFAULT_TIMEOUT): Promise<AppHandle> {
	const log: string[] = [];
	const proc = spawn(["bun", "start"], {
		cwd: PROJECT_DIR,
		stdout: "pipe",
		stderr: "pipe",
	});

	const deadline = Date.now() + timeoutMs;

	// Read stdout line by line looking for the startup marker
	const reader = proc.stdout.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (Date.now() < deadline) {
		const { value, done } = await Promise.race([
			reader.read(),
			sleep(1000).then(() => ({ value: undefined, done: false })),
		]);

		if (done) throw new Error("App process exited before startup completed");

		if (value) {
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				log.push(line);
				if (line.includes(STARTUP_MARKER)) {
					// Release the reader so we don't block
					reader.releaseLock();
					// Give UI time to render
					await sleep(2000);
					return { proc, pid: proc.pid, log };
				}
			}
		}
	}

	proc.kill();
	throw new Error(`App did not start within ${timeoutMs}ms. Log:\n${log.join("\n")}`);
}

/** Kill the app and all related processes. */
export async function killApp(handle: AppHandle): Promise<void> {
	handle.proc.kill();
	// Also kill any lingering electrobun/app processes
	for (const pattern of ["electrobun dev", "electrobun build", APP_NAME, "TerminalCommander"]) {
		spawn(["pkill", "-f", pattern], { stdout: "ignore", stderr: "ignore" });
	}
	await sleep(500);
	// Force kill if still alive
	spawn(["pkill", "-9", "-f", "electrobun"], { stdout: "ignore", stderr: "ignore" });
	await sleep(500);
}

// ---------------------------------------------------------------------------
// macOS UI interaction via osascript
// ---------------------------------------------------------------------------

/** Run an AppleScript and return stdout. */
async function osascript(script: string): Promise<string> {
	const proc = spawn(["osascript", "-e", script], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const output = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`osascript failed (${exitCode}): ${stderr}\nScript: ${script}`);
	}
	return output.trim();
}

/** Send a keystroke to the app via System Events. */
export async function sendKeystroke(
	key: string,
	modifiers: ("control" | "shift" | "command" | "option")[] = [],
): Promise<void> {
	const using = modifiers.length > 0
		? ` using {${modifiers.map((m) => `${m} down`).join(", ")}}`
		: "";

	await osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				set frontmost to true
				keystroke "${key}"${using}
			end tell
		end tell
	`);
	await sleep(300);
}

/** Send a special key (arrow, return, etc.) to the app. */
export async function sendKeyCode(
	keyCode: number,
	modifiers: ("control" | "shift" | "command" | "option")[] = [],
): Promise<void> {
	const using = modifiers.length > 0
		? ` using {${modifiers.map((m) => `${m} down`).join(", ")}}`
		: "";

	await osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				set frontmost to true
				key code ${keyCode}${using}
			end tell
		end tell
	`);
	await sleep(300);
}

/** Click a UI element by its name/description. */
export async function clickButton(buttonName: string): Promise<void> {
	await osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				set frontmost to true
				click button "${buttonName}" of window 1
			end tell
		end tell
	`);
	await sleep(300);
}

/** Type a string into the focused element. */
export async function typeText(text: string): Promise<void> {
	await osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				set frontmost to true
				keystroke "${text}"
			end tell
		end tell
	`);
	await sleep(200);
}

/** Get the window title. */
export async function getWindowTitle(): Promise<string> {
	return osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				get name of window 1
			end tell
		end tell
	`);
}

/** Get the number of windows. */
export async function getWindowCount(): Promise<number> {
	const result = await osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				count of windows
			end tell
		end tell
	`);
	return parseInt(result, 10);
}

/** Check if the app process exists. */
export async function isAppRunning(): Promise<boolean> {
	try {
		const result = await osascript(`
			tell application "System Events"
				exists process "${APP_NAME}"
			end tell
		`);
		return result === "true";
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// macOS key codes for special keys
// ---------------------------------------------------------------------------

export const KeyCode = {
	Return: 36,
	Tab: 48,
	Space: 49,
	Delete: 51,
	Escape: 53,
	LeftArrow: 123,
	RightArrow: 124,
	DownArrow: 125,
	UpArrow: 126,
} as const;

// ---------------------------------------------------------------------------
// Screenshot
// ---------------------------------------------------------------------------

/** Capture a screenshot of the entire screen. Returns the file path. */
export async function captureScreenshot(outputPath?: string): Promise<string> {
	const path = outputPath || `/tmp/tc-e2e-${Date.now()}.png`;
	const proc = spawn(["screencapture", "-x", path], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`screencapture failed with code ${exitCode}`);
	}
	return path;
}

/** Capture a screenshot of a specific window by name. */
export async function captureWindow(outputPath?: string): Promise<string> {
	const path = outputPath || `/tmp/tc-e2e-${Date.now()}.png`;

	// Get the window ID via osascript
	const windowId = await osascript(`
		tell application "System Events"
			tell process "${APP_NAME}"
				set frontmost to true
				get id of window 1
			end tell
		end tell
	`);

	const proc = spawn(["screencapture", "-l", windowId, "-x", path], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		// Fallback to full screen capture
		return captureScreenshot(path);
	}
	return path;
}

/** Remove a screenshot file. */
export function cleanupScreenshot(path: string): void {
	if (existsSync(path)) unlinkSync(path);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for a condition to be true, with polling. */
export async function waitFor(
	condition: () => Promise<boolean> | boolean,
	timeoutMs = 10_000,
	intervalMs = 500,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await condition()) return;
		await sleep(intervalMs);
	}
	throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
