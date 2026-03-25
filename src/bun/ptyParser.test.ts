import { describe, test, expect } from "bun:test";
import { parsePtyOutput } from "./ptyParser.ts";

describe("parsePtyOutput", () => {
	// --- BEL detection ---

	test("detects standalone BEL", () => {
		const result = parsePtyOutput("\x07");
		expect(result.hasBell).toBe(true);
		expect(result.title).toBeUndefined();
	});

	test("detects multiple BELs", () => {
		const result = parsePtyOutput("hello\x07world\x07");
		expect(result.hasBell).toBe(true);
	});

	test("no BEL in normal text", () => {
		const result = parsePtyOutput("hello world");
		expect(result.hasBell).toBe(false);
		expect(result.title).toBeUndefined();
	});

	// --- OSC title (BEL terminator) ---

	test("parses OSC 0 title with BEL terminator", () => {
		const result = parsePtyOutput("\x1b]0;My Title\x07");
		expect(result.title).toBe("My Title");
		expect(result.hasBell).toBe(false); // BEL is OSC terminator, not standalone
	});

	test("parses OSC 2 title with BEL terminator", () => {
		const result = parsePtyOutput("\x1b]2;Claude: my-session\x07");
		expect(result.title).toBe("Claude: my-session");
		expect(result.hasBell).toBe(false);
	});

	// --- OSC title (ST terminator) ---

	test("parses OSC 0 title with ST terminator", () => {
		const result = parsePtyOutput("\x1b]0;My Title\x1b\\");
		expect(result.title).toBe("My Title");
		expect(result.hasBell).toBe(false);
	});

	test("parses OSC 2 title with ST terminator", () => {
		const result = parsePtyOutput("\x1b]2;Session Name\x1b\\");
		expect(result.title).toBe("Session Name");
		expect(result.hasBell).toBe(false);
	});

	// --- OSC + standalone BEL ---

	test("OSC title followed by standalone BEL", () => {
		const result = parsePtyOutput("\x1b]0;Title\x07\x07");
		expect(result.title).toBe("Title");
		expect(result.hasBell).toBe(true); // Second BEL is standalone
	});

	test("standalone BEL before OSC title", () => {
		const result = parsePtyOutput("\x07\x1b]2;Title\x07");
		expect(result.title).toBe("Title");
		expect(result.hasBell).toBe(true); // First BEL is standalone
	});

	// --- Non-title OSC sequences ---

	test("ignores non-0/2 OSC sequences", () => {
		const result = parsePtyOutput("\x1b]9;notification\x07");
		expect(result.title).toBeUndefined();
		expect(result.hasBell).toBe(false); // BEL is OSC terminator
	});

	test("ignores OSC 1 (icon name)", () => {
		const result = parsePtyOutput("\x1b]1;icon\x07");
		expect(result.title).toBeUndefined();
	});

	// --- Mixed with normal output ---

	test("title embedded in normal output", () => {
		const result = parsePtyOutput("hello\x1b]0;My Title\x07world");
		expect(result.title).toBe("My Title");
		expect(result.hasBell).toBe(false);
	});

	test("CSI sequences are skipped correctly", () => {
		const result = parsePtyOutput("\x1b[31mred text\x1b[0m\x1b]0;Title\x07");
		expect(result.title).toBe("Title");
		expect(result.hasBell).toBe(false);
	});

	// --- Last title wins ---

	test("multiple OSC titles: last one wins", () => {
		const result = parsePtyOutput("\x1b]0;First\x07\x1b]2;Second\x07");
		expect(result.title).toBe("Second");
	});

	// --- Edge cases ---

	test("empty string", () => {
		const result = parsePtyOutput("");
		expect(result.hasBell).toBe(false);
		expect(result.title).toBeUndefined();
	});

	test("empty title", () => {
		const result = parsePtyOutput("\x1b]0;\x07");
		expect(result.title).toBe("");
	});

	test("title with special characters", () => {
		const result = parsePtyOutput("\x1b]0;~/dev/project (main)\x07");
		expect(result.title).toBe("~/dev/project (main)");
	});

	test("title with unicode", () => {
		const result = parsePtyOutput("\x1b]0;プロジェクト名\x07");
		expect(result.title).toBe("プロジェクト名");
	});

	test("incomplete OSC at end of chunk is ignored", () => {
		const result = parsePtyOutput("\x1b]0;partial");
		expect(result.title).toBeUndefined();
		expect(result.hasBell).toBe(false);
	});

	test("lone ESC is ignored", () => {
		const result = parsePtyOutput("\x1b");
		expect(result.title).toBeUndefined();
		expect(result.hasBell).toBe(false);
	});

	// --- OSC 7 cwd ---

	test("parses OSC 7 cwd with file:// URL (BEL terminator)", () => {
		const result = parsePtyOutput("\x1b]7;file://localhost/Users/test/project\x07");
		expect(result.cwd).toBe("/Users/test/project");
		expect(result.hasBell).toBe(false);
	});

	test("parses OSC 7 cwd with file:// URL (ST terminator)", () => {
		const result = parsePtyOutput("\x1b]7;file://localhost/tmp\x1b\\");
		expect(result.cwd).toBe("/tmp");
	});

	test("parses OSC 7 cwd with bare path", () => {
		const result = parsePtyOutput("\x1b]7;/home/user/dev\x07");
		expect(result.cwd).toBe("/home/user/dev");
	});

	test("parses OSC 7 cwd with URL-encoded path", () => {
		const result = parsePtyOutput("\x1b]7;file://localhost/Users/test/my%20project\x07");
		expect(result.cwd).toBe("/Users/test/my project");
	});

	test("OSC 7 with empty hostname", () => {
		const result = parsePtyOutput("\x1b]7;file:///Users/test\x07");
		expect(result.cwd).toBe("/Users/test");
	});

	test("OSC 7 does not affect title", () => {
		const result = parsePtyOutput("\x1b]7;file:///tmp\x07\x1b]0;My Title\x07");
		expect(result.cwd).toBe("/tmp");
		expect(result.title).toBe("My Title");
	});

	test("title and cwd in same chunk", () => {
		const result = parsePtyOutput("\x1b]0;Shell\x07\x1b]7;file:///home/user\x07");
		expect(result.title).toBe("Shell");
		expect(result.cwd).toBe("/home/user");
	});
});
