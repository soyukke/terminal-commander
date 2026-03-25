/**
 * playheavy Inspector プロトコル互換サーバー (TypeScript/Bun 実装)
 *
 * 改行区切り JSON over TCP (デフォルト port 9274)。
 * Terminal Commander の各タイルを要素として登録し、
 * playheavy Python クライアントから E2E テスト可能にする。
 */
import type { Socket, TCPSocketListener } from "bun";

// ================================================================
// Types
// ================================================================

export interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Element {
	eid: number;
	role: string;
	name: string;
	bounds: Bounds;
	text: string;
	properties: Record<string, string>;
	active: boolean;
}

type EventKind =
	| "element_added"
	| "element_removed"
	| "text_changed"
	| "bounds_changed"
	| "property_changed";

interface Subscription {
	event: EventKind;
	eidFilter: number | null;
}

type MethodHandler = (paramsJson: Record<string, any>) => any | Promise<any>;

interface ClientState {
	buffer: string;
	subscriptions: Subscription[];
}

// ================================================================
// InspectorServer
// ================================================================

export const DEFAULT_PORT = 9274;

export class InspectorServer {
	private elements: Element[] = [];
	private customMethods = new Map<string, MethodHandler>();
	private clients = new Map<Socket<ClientState>, ClientState>();
	private server: TCPSocketListener<ClientState> | null = null;
	private nextEid = 0;
	private _ready = false;

	// ---- Lifecycle ----

	start(port = DEFAULT_PORT): void {
		const self = this;
		this.server = Bun.listen<ClientState>({
			hostname: "127.0.0.1",
			port,
			socket: {
				open(socket) {
					const state: ClientState = { buffer: "", subscriptions: [] };
					socket.data = state;
					self.clients.set(socket, state);
				},
				data(socket, data) {
					self.onData(socket, data);
				},
				close(socket) {
					self.clients.delete(socket);
				},
				error(_socket, err) {
					console.error("[Inspector] socket error:", err);
				},
			},
		});
		console.log(`[Inspector] listening on 127.0.0.1:${port}`);
	}

	stop(): void {
		this.server?.stop();
		this.server = null;
		this.clients.clear();
	}

	// ---- Element management ----

	register(opts: {
		role?: string;
		name: string;
		bounds?: Bounds;
		text?: string;
		properties?: Record<string, string>;
	}): number {
		const eid = this.nextEid++;
		const elem: Element = {
			eid,
			role: opts.role || "custom",
			name: opts.name,
			bounds: opts.bounds || { x: 0, y: 0, width: 0, height: 0 },
			text: opts.text || "",
			properties: { ...opts.properties },
			active: true,
		};
		this.elements.push(elem);
		this.notify("element_added", eid);
		return eid;
	}

	unregister(eid: number): void {
		const elem = this.elements[eid];
		if (elem) {
			elem.active = false;
			this.notify("element_removed", eid);
		}
	}

	updateText(eid: number, text: string): void {
		const elem = this.elements[eid];
		if (elem) {
			elem.text = text;
			this.notify("text_changed", eid);
		}
	}

	updateName(eid: number, name: string): void {
		const elem = this.elements[eid];
		if (elem) {
			elem.name = name;
		}
	}

	updateBounds(eid: number, bounds: Bounds): void {
		const elem = this.elements[eid];
		if (elem) {
			elem.bounds = bounds;
			this.notify("bounds_changed", eid);
		}
	}

	updateProperty(eid: number, key: string, value: string): void {
		const elem = this.elements[eid];
		if (elem) {
			elem.properties[key] = value;
			this.notifyExtra("property_changed", eid, key, value);
		}
	}

	/** アプリの初期化完了を通知する。health が ready:true を返すようになる。 */
	setReady(): void {
		this._ready = true;
	}

	get ready(): boolean {
		return this._ready;
	}

	registerMethod(name: string, handler: MethodHandler): void {
		this.customMethods.set(name, handler);
	}

	// ---- TCP data handling ----

	private onData(socket: Socket<ClientState>, data: Buffer | string): void {
		const state = socket.data;
		state.buffer += typeof data === "string" ? data : data.toString();

		let newlineIdx: number;
		while ((newlineIdx = state.buffer.indexOf("\n")) !== -1) {
			const line = state.buffer.slice(0, newlineIdx);
			state.buffer = state.buffer.slice(newlineIdx + 1);
			if (line.length > 0) {
				this.handleMessage(socket, line);
			}
		}
	}

	private async handleMessage(
		socket: Socket<ClientState>,
		line: string,
	): Promise<void> {
		let msg: any;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}

		const id = msg.id ?? 0;
		const method = msg.method;
		if (!method) {
			this.send(socket, { id, error: "missing method" });
			return;
		}

		try {
			const response = await this.dispatch(socket, id, method, msg);
			if (response !== undefined) {
				this.send(socket, response);
			}
		} catch (e: any) {
			this.send(socket, { id, error: e.message || String(e) });
		}
	}

	private async dispatch(
		socket: Socket<ClientState>,
		id: number,
		method: string,
		msg: any,
	): Promise<any> {
		switch (method) {
			case "ping":
				return { id, ok: true };

			case "health":
				return {
					id,
					ready: this._ready,
					element_count: this.activeElements().length,
				};

			case "list":
				return this.handleList(id);

			case "find":
				return this.handleFind(id, msg.role, msg.name);

			case "find_all":
				return this.handleFindAll(id, msg.role, msg.name);

			case "click":
				return this.handleClick(id, msg.eid);

			case "get_text":
				return this.handleGetText(id, msg.eid);

			case "fill":
				return this.handleFill(id, msg.eid, msg.value);

			case "type_text":
				return this.handleTypeText(id, msg.text, msg.eid);

			case "screenshot":
				return this.handleScreenshot(id);

			case "subscribe":
				return this.handleSubscribe(socket, id, msg.event, msg.eid);

			case "unsubscribe":
				return this.handleUnsubscribe(socket, id, msg.event);

			default: {
				const handler = this.customMethods.get(method);
				if (handler) {
					const result = await handler(msg);
					return { id, ...result };
				}
				return { id, error: "unknown method" };
			}
		}
	}

	// ---- Standard method handlers ----

	private handleList(id: number): any {
		return {
			id,
			elements: this.activeElements().map((e) => this.elementToJson(e)),
		};
	}

	private handleFind(id: number, role?: string, name?: string): any {
		for (const elem of this.activeElements()) {
			if (role && elem.role !== role) continue;
			if (name && elem.name !== name) continue;
			return { id, ...this.elementToJson(elem) };
		}
		return { id, error: "not found" };
	}

	private handleFindAll(id: number, role?: string, name?: string): any {
		const results: any[] = [];
		for (const elem of this.activeElements()) {
			if (role && elem.role !== role) continue;
			if (name && elem.name !== name) continue;
			results.push(this.elementToJson(elem));
		}
		return { id, elements: results };
	}

	private handleClick(id: number, eid: number): any {
		const elem = this.elements[eid];
		if (!elem?.active) return { id, error: "invalid eid" };
		const x = elem.bounds.x + elem.bounds.width / 2;
		const y = elem.bounds.y + elem.bounds.height / 2;
		return { id, ok: true, x, y };
	}

	private handleGetText(id: number, eid: number): any {
		const elem = this.elements[eid];
		if (!elem?.active) return { id, error: "invalid eid" };
		return { id, text: elem.text };
	}

	private handleFill(id: number, eid: number, value: string): any {
		const elem = this.elements[eid];
		if (!elem?.active) return { id, error: "invalid eid" };
		elem.text = value;
		this.notify("text_changed", eid);
		return { id, ok: true };
	}

	private handleTypeText(
		id: number,
		text: string,
		eid?: number,
	): any {
		if (eid !== undefined) {
			const elem = this.elements[eid];
			if (!elem?.active) return { id, error: "invalid eid" };
			elem.text += text;
			this.notify("text_changed", eid);
			return { id, ok: true };
		}
		// Fallback: first text_field
		for (const elem of this.activeElements()) {
			if (elem.role === "text_field") {
				elem.text += text;
				this.notify("text_changed", elem.eid);
				return { id, ok: true };
			}
		}
		return { id, error: "no text_field element" };
	}

	private handleScreenshot(id: number): any {
		const tmpPath = `/tmp/tc-inspector-screenshot-${Date.now()}.png`;
		try {
			Bun.spawnSync(["screencapture", "-x", tmpPath]);
			const file = Bun.file(tmpPath);
			const buf = new Uint8Array(file.size!);
			const fd = require("fs").openSync(tmpPath, "r");
			require("fs").readSync(fd, buf);
			require("fs").closeSync(fd);
			const base64 = Buffer.from(buf).toString("base64");
			require("fs").unlinkSync(tmpPath);
			return { id, image: base64 };
		} catch (e: any) {
			return { id, error: `screenshot failed: ${e.message}` };
		}
	}

	private handleSubscribe(
		socket: Socket<ClientState>,
		id: number,
		event: string,
		eid?: number,
	): any {
		const state = socket.data;
		const eventKind = event as EventKind;

		// Deduplicate
		const exists = state.subscriptions.some(
			(s) =>
				s.event === eventKind &&
				s.eidFilter === (eid ?? null),
		);
		if (!exists) {
			state.subscriptions.push({
				event: eventKind,
				eidFilter: eid ?? null,
			});
		}
		return { id, ok: true };
	}

	private handleUnsubscribe(
		socket: Socket<ClientState>,
		id: number,
		event: string,
	): any {
		const state = socket.data;
		state.subscriptions = state.subscriptions.filter(
			(s) => s.event !== event,
		);
		return { id, ok: true };
	}

	// ---- Event notification ----

	private notify(event: EventKind, eid: number): void {
		const elem = this.elements[eid];
		if (!elem) return;

		const payload: any = {
			event,
			eid,
			role: elem.role,
			name: elem.name,
			text: elem.text,
			...elem.properties,
		};

		this.pushToSubscribers(event, eid, payload);
	}

	private notifyExtra(
		event: EventKind,
		eid: number,
		key: string,
		value: string,
	): void {
		const elem = this.elements[eid];
		if (!elem) return;

		const payload: any = {
			event,
			eid,
			role: elem.role,
			name: elem.name,
			text: elem.text,
			key,
			value,
			...elem.properties,
		};

		this.pushToSubscribers(event, eid, payload);
	}

	private pushToSubscribers(
		event: EventKind,
		eid: number,
		payload: any,
	): void {
		const line = JSON.stringify(payload) + "\n";
		for (const [socket, state] of this.clients) {
			for (const sub of state.subscriptions) {
				if (sub.event !== event) continue;
				if (sub.eidFilter !== null && sub.eidFilter !== eid) continue;
				try {
					socket.write(line);
				} catch {
					// Client disconnected
				}
				break; // Only send once per client
			}
		}
	}

	// ---- Helpers ----

	private activeElements(): Element[] {
		return this.elements.filter((e) => e.active);
	}

	private elementToJson(elem: Element): any {
		return {
			eid: elem.eid,
			role: elem.role,
			name: elem.name,
			x: elem.bounds.x,
			y: elem.bounds.y,
			w: elem.bounds.width,
			h: elem.bounds.height,
			text: elem.text,
			...elem.properties,
		};
	}

	private send(socket: Socket<ClientState>, data: any): void {
		try {
			socket.write(JSON.stringify(data) + "\n");
		} catch {
			// Client disconnected
		}
	}
}
