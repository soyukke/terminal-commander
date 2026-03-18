import type { RPCSchema } from "electrobun/bun";

export type TerminalRPCType = {
	bun: RPCSchema<{
		requests: {
			createTerminal: {
				params: { cols: number; rows: number };
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
			terminalExit: { id: string; exitCode: number };
		};
	}>;
};
