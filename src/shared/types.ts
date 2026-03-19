import type { RPCSchema } from "electrobun/bun";
import type { AppConfig } from "./config.ts";

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
		};
		messages: {
			writeToTerminal: { id: string; data: string };
			resizeTerminal: { id: string; cols: number; rows: number };
		};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			terminalOutput: { id: string; data: string };
			terminalTitle: { id: string; title: string };
			terminalBell: { id: string };
			terminalExit: { id: string; exitCode: number };
		};
	}>;
};
