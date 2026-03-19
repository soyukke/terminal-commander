type OnOutput = (id: string, data: string) => void;
type OnExit = (id: string, exitCode: number) => void;

interface PtySession {
	proc: ReturnType<typeof Bun.spawn>;
}

const decoder = new TextDecoder();

export class PtyManager {
	private sessions = new Map<string, PtySession>();
	private nextId = 0;
	private onOutput: OnOutput;
	private onExit: OnExit;

	constructor(opts: { onOutput: OnOutput; onExit: OnExit }) {
		this.onOutput = opts.onOutput;
		this.onExit = opts.onExit;
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
				// Only fire onExit if session still exists (not already closed)
				if (this.sessions.has(id)) {
					this.sessions.delete(id);
					this.onExit(id, exitCode ?? 0);
				}
			})
			.catch(() => {
				// Process was killed or errored; clean up silently
				this.sessions.delete(id);
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
