import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { SessionData, SessionTile } from "../shared/types.ts";

// Replicate the session logic from bun/index.ts for isolated testing
const SESSION_VERSION = 1;

function loadSessionFile(path: string): SessionData | null {
	try {
		const content = readFileSync(path, "utf-8");
		const data = JSON.parse(content);
		if (data?.version === SESSION_VERSION && Array.isArray(data?.tiles)) {
			return data as SessionData;
		}
		return null;
	} catch {
		return null;
	}
}

function saveSessionFile(path: string, tiles: SessionTile[]): void {
	const dir = join(path, "..");
	mkdirSync(dir, { recursive: true });
	const data: SessionData = {
		version: SESSION_VERSION,
		savedAt: new Date().toISOString(),
		tiles,
	};
	writeFileSync(path, JSON.stringify(data, null, 2));
}

describe("session persistence", () => {
	let testDir: string;
	let sessionPath: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `tc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
		sessionPath = join(testDir, "session.json");
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	test("save and load round-trips tile data", () => {
		const tiles: SessionTile[] = [
			{ name: "Claude: frontend", color: "#7aa2f7", cwd: "/home/user/project", command: null },
			{ name: "Shell", color: "#9ece6a", cwd: "/tmp", command: null },
		];

		saveSessionFile(sessionPath, tiles);
		const loaded = loadSessionFile(sessionPath);

		expect(loaded).not.toBeNull();
		expect(loaded!.version).toBe(SESSION_VERSION);
		expect(loaded!.tiles).toEqual(tiles);
		expect(loaded!.savedAt).toBeTruthy();
	});

	test("load returns null for missing file", () => {
		expect(loadSessionFile(join(testDir, "nonexistent.json"))).toBeNull();
	});

	test("load returns null for corrupted JSON", () => {
		writeFileSync(sessionPath, "not valid json{{{");
		expect(loadSessionFile(sessionPath)).toBeNull();
	});

	test("load returns null for wrong version", () => {
		writeFileSync(sessionPath, JSON.stringify({ version: 999, tiles: [] }));
		expect(loadSessionFile(sessionPath)).toBeNull();
	});

	test("load returns null for missing tiles array", () => {
		writeFileSync(sessionPath, JSON.stringify({ version: SESSION_VERSION }));
		expect(loadSessionFile(sessionPath)).toBeNull();
	});

	test("save overwrites previous session", () => {
		saveSessionFile(sessionPath, [
			{ name: "Old", color: "#000", cwd: "/old", command: null },
		]);
		saveSessionFile(sessionPath, [
			{ name: "New", color: "#fff", cwd: "/new", command: null },
		]);

		const loaded = loadSessionFile(sessionPath);
		expect(loaded!.tiles).toHaveLength(1);
		expect(loaded!.tiles[0].name).toBe("New");
	});

	test("save empty tiles array clears session", () => {
		saveSessionFile(sessionPath, [
			{ name: "Tile", color: "#000", cwd: "/", command: null },
		]);
		saveSessionFile(sessionPath, []);

		const loaded = loadSessionFile(sessionPath);
		expect(loaded!.tiles).toHaveLength(0);
	});

	test("tile order is preserved", () => {
		const tiles: SessionTile[] = [
			{ name: "First", color: "#111", cwd: "/a", command: null },
			{ name: "Second", color: "#222", cwd: "/b", command: null },
			{ name: "Third", color: "#333", cwd: "/c", command: null },
		];

		saveSessionFile(sessionPath, tiles);
		const loaded = loadSessionFile(sessionPath);

		expect(loaded!.tiles.map(t => t.name)).toEqual(["First", "Second", "Third"]);
	});
});
