import { parsePtyOutput } from "./ptyParser.ts";
import { debugLog } from "./debugLog.ts";

type OnOutput = (id: string, data: string) => void;
type OnExit = (id: string, exitCode: number) => void;
type OnTitle = (id: string, title: string) => void;
type OnBell = (id: string) => void;
type OnCwd = (id: string, cwd: string) => void;

const OUTPUT_BUFFER_MAX = 100_000; // 100KB ring buffer

interface PtySession {
	proc: ReturnType<typeof Bun.spawn> | null;
	outputBuffer: string;
}

interface PtyManagerOpts {
	onOutput: OnOutput;
	onExit: OnExit;
	onTitle?: OnTitle;
	onBell?: OnBell;
	onCwd?: OnCwd;
}

const decoder = new TextDecoder();

export class PtyManager {
	private sessions = new Map<string, PtySession>();
	private nextId = 0;
	private onOutput: OnOutput;
	private onExit: OnExit;
	private onTitle?: OnTitle;
	private onBell?: OnBell;
	private onCwd?: OnCwd;

	constructor(opts: PtyManagerOpts) {
		this.onOutput = opts.onOutput;
		this.onExit = opts.onExit;
		this.onTitle = opts.onTitle;
		this.onBell = opts.onBell;
		this.onCwd = opts.onCwd;
	}

	create(
		cols: number,
		rows: number,
		opts?: { command?: string; cwd?: string; env?: Record<string, string> }
	): string {
		const id = `term-${this.nextId++}`;
		const shell =
			process.env.SHELL ||
			(process.platform === "win32" ? "cmd.exe" : "/bin/bash");

		// Use login shell (-l) so .zprofile/.zshrc/direnv/nix are loaded
		const args = opts?.command
			? [shell, "-l", "-c", opts.command]
			: [shell, "-l"];

		// Register session before spawn so data callbacks can find it
		const session: PtySession = { proc: null, outputBuffer: "" };
		this.sessions.set(id, session);

		const proc = Bun.spawn(args, {
			cwd: opts?.cwd || undefined,
			terminal: {
				cols,
				rows,
				data: (_term, data) => {
					const text =
						typeof data === "string" ? data : decoder.decode(data);
					debugLog("PTY_OUTPUT", text);
					const parsed = parsePtyOutput(text);
					if (parsed.title !== undefined && this.onTitle) {
						this.onTitle(id, parsed.title);
					}
					if (parsed.cwd !== undefined && this.onCwd) {
						this.onCwd(id, parsed.cwd);
					}
					if (parsed.hasBell && this.onBell) {
						this.onBell(id);
					}

					// Append to output buffer (ring buffer)
				session.outputBuffer += text;
				if (session.outputBuffer.length > OUTPUT_BUFFER_MAX) {
					session.outputBuffer = session.outputBuffer.slice(-OUTPUT_BUFFER_MAX);
				}

				this.onOutput(id, text);
				},
			},
			env: {
				...process.env,
				...opts?.env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
			},
		});

		session.proc = proc;

		proc.exited
			.then((exitCode) => {
				// Skip if already removed by close()
				if (this.sessions.has(id)) {
					this.sessions.delete(id);
					this.onExit(id, exitCode ?? 0);
				}
			})
			.catch(() => {
				// Process crashed or was killed — still notify so callers can clean up
				if (this.sessions.has(id)) {
					this.sessions.delete(id);
					this.onExit(id, -1);
				}
			});

		return id;
	}

	write(id: string, data: string): boolean {
		const session = this.sessions.get(id);
		if (!session?.proc) return false;
		debugLog("PTY_WRITE", data);
		session.proc.terminal?.write(data);
		return true;
	}

	resize(id: string, cols: number, rows: number): boolean {
		const session = this.sessions.get(id);
		if (!session?.proc) return false;
		session.proc.terminal?.resize(cols, rows);
		return true;
	}

	close(id: string): boolean {
		const session = this.sessions.get(id);
		if (!session) return false;
		this.sessions.delete(id);
		session.proc?.kill();
		return true;
	}

	getOutputBuffer(id: string): string | null {
		return this.sessions.get(id)?.outputBuffer ?? null;
	}

	closeAll(): void {
		for (const session of this.sessions.values()) {
			session.proc.kill();
		}
		this.sessions.clear();
	}
}
