import { BrowserWindow, BrowserView } from "electrobun/bun";
import type { TerminalRPCType } from "../shared/types.ts";
import { PtyManager } from "./ptyManager.ts";

let mainWindow: BrowserWindow;

const ptyManager = new PtyManager({
	onOutput: (id, data) => {
		mainWindow.webview.rpc.send.terminalOutput({ id, data });
	},
	onExit: (id, exitCode) => {
		mainWindow.webview.rpc.send.terminalExit({ id, exitCode });
	},
});

const terminalRPC = BrowserView.defineRPC<TerminalRPCType>({
	maxRequestTime: 10000,
	handlers: {
		requests: {
			createTerminal: ({ cols, rows }) => {
				const id = ptyManager.create(cols, rows);
				return { id };
			},
			closeTerminal: ({ id }) => ({
				success: ptyManager.close(id),
			}),
		},
		messages: {
			writeToTerminal: ({ id, data }) => {
				ptyManager.write(id, data);
			},
			resizeTerminal: ({ id, cols, rows }) => {
				ptyManager.resize(id, cols, rows);
			},
		},
	},
});

mainWindow = new BrowserWindow({
	title: "Terminal Commander",
	url: "views://mainview/index.html",
	frame: {
		width: 1200,
		height: 800,
		x: 100,
		y: 100,
	},
	rpc: terminalRPC,
});

console.log("Terminal Commander started!");
