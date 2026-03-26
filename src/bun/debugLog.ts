import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOG_DIR = join(homedir(), ".terminal-commander-logs");
const LOG_FILE = join(LOG_DIR, "debug.log");

try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const buffer: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function debugLog(tag: string, data: string): void {
	const ts = performance.now().toFixed(1);
	const escaped = JSON.stringify(data);
	buffer.push(`${ts}\t${tag}\t${escaped}\n`);
	if (!flushTimer) {
		flushTimer = setTimeout(() => {
			appendFileSync(LOG_FILE, buffer.join(""));
			buffer.length = 0;
			flushTimer = null;
		}, 100);
	}
}
