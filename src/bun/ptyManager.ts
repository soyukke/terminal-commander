import { parsePtyOutput } from "./ptyParser.ts";

type OnOutput = (id: string, data: string) => void;
type OnExit = (id: string, exitCode: number) => void;
type OnTitle = (id: string, title: string) => void;
type OnBell = (id: string) => void;

interface PtySession {
	proc: ReturnType<typeof Bun.spawn>;
}

interface PtyManagerOpts {
	onOutput: OnOutput;
	onExit: OnExit;
	onTitle?: OnTitle;
	onBell?: OnBell;
}

const decoder = new TextDecoder();

export class PtyManager {
	private sessions = new Map<string, PtySession>();
	private nextId = 0;
	private onOutput: OnOutput;
	private onExit: OnExit;
	private onTitle?: OnTitle;
	private onBell?: OnBell;

	constructor(opts: PtyManagerOpts) {
		this.onOutput = opts.onOutput;
		this.onExit = opts.onExit;
		this.onTitle = opts.onTitle;
		this.onBell = opts.onBell;
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

		const args = opts?.command ? [shell, "-c", opts.command] : [shell];

		const proc = Bun.spawn(args, {
			cwd: opts?.cwd || undefined,
			terminal: {
				cols,
				rows,
				data: (_term, data) => {
					const text =
						typeof data === "string" ? data : decoder.decode(data);

					const parsed = parsePtyOutput(text);
					if (parsed.title !== undefined && this.onTitle) {
						this.onTitle(id, parsed.title);
					}
					if (parsed.hasBell && this.onBell) {
						this.onBell(id);
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

		this.sessions.set(id, { proc });
		return id;
	}

	write(id: string, data: string): boolean {
		const session = this.sessions.get(id);
		if (!session) return false;
		session.proc.terminal?.write(data);
		return true;
	}

	resize(id: string, cols: number, rows: number): boolean {
		const session = this.sessions.get(id);
		if (!session) return false;
		session.proc.terminal?.resize(cols, rows);
		return true;
	}

	close(id: string): boolean {
		const session = this.sessions.get(id);
		if (!session) return false;
		this.sessions.delete(id);
		session.proc.kill();
		return true;
	}

	closeAll(): void {
		for (const session of this.sessions.values()) {
			session.proc.kill();
		}
		this.sessions.clear();
	}
}
