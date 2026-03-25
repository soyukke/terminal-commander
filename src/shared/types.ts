import type { RPCSchema } from "electrobun/bun";
import type { AppConfig } from "./config.ts";

export type TerminalRPCStatus = "running" | "idle";
export type TerminalStatus = TerminalRPCStatus | "exited";

/** browseDirectory opens a native dialog — needs a long timeout */
export const RPC_MAX_REQUEST_TIME = 300_000;

export interface SessionTile {
	name: string;
	color: string;
	cwd: string;
	command: string | null;
}

export interface SessionData {
	version: number;
	savedAt: string;
	tiles: SessionTile[];
}

export type TerminalRPCType = {
	bun: RPCSchema<{
		requests: {
			getConfig: {
				params: {};
				response: { config: AppConfig };
			};
			createTerminal: {
				params: { cols: number; rows: number; command?: string; cwd?: string };
				response: { id: string };
			};
			closeTerminal: {
				params: { id: string };
				response: { success: boolean };
			};
			browseDirectory: {
				params: { startingFolder?: string };
				response: { path: string | null };
			};
			getRecentDirs: {
				params: {};
				response: { dirs: string[] };
			};
			saveRecentDir: {
				params: { dir: string };
				response: { success: boolean };
			};
			saveSession: {
				params: { tiles: SessionTile[] };
				response: { success: boolean };
			};
			loadSession: {
				params: {};
				response: { session: SessionData | null };
			};
		};
		messages: {
			writeToTerminal: { id: string; data: string };
			resizeTerminal: { id: string; cols: number; rows: number };
		};
	}>;
	webview: RPCSchema<{
		requests: {
			inspectorCreateTile: {
				params: { command?: string; cwd?: string };
				response: { id: string };
			};
			inspectorCloseTile: {
				params: { terminalId: string };
				response: { success: boolean };
			};
		};
		messages: {
			terminalOutput: { id: string; data: string };
			terminalTitle: { id: string; title: string };
			terminalBell: { id: string };
			terminalExit: { id: string; exitCode: number };
			terminalStatus: { id: string; status: TerminalRPCStatus };
			terminalCwd: { id: string; cwd: string };
		};
	}>;
};
