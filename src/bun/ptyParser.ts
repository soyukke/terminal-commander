export interface PtyParseResult {
	title?: string;
	cwd?: string;
	hasBell: boolean;
}

type State =
	| "NORMAL"
	| "ESC"
	| "OSC_NUM"
	| "OSC_TITLE"
	| "OSC_CWD"
	| "OSC_SKIP"
	| "OSC_ESC"
	| "OSC_CWD_ESC"
	| "CSI";

const NO_OP: PtyParseResult = { hasBell: false };

/** Extract filesystem path from OSC 7 value (file://hostname/path) */
function extractPathFromOsc7(raw: string): string | undefined {
	try {
		if (raw.startsWith("file://")) {
			const url = new URL(raw);
			return decodeURIComponent(url.pathname) || undefined;
		}
		// Some shells emit just the path
		if (raw.startsWith("/")) return raw;
	} catch {
		// Malformed URL
	}
	return undefined;
}

/**
 * Parse PTY output for OSC title/cwd sequences and BEL characters.
 * OSC 0/2 titles and OSC 7 cwd are extracted; BEL inside OSC terminators is not counted.
 */
export function parsePtyOutput(text: string): PtyParseResult {
	// Fast path: most chunks contain no escape sequences or bell
	if (text.indexOf("\x1b") === -1 && text.indexOf("\x07") === -1) {
		return NO_OP;
	}

	let title: string | undefined;
	let cwd: string | undefined;
	let hasBell = false;

	let state: State = "NORMAL";
	let oscNum = "";
	let oscBuf = "";

	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);

		switch (state) {
			case "NORMAL":
				if (code === 0x1b) {
					state = "ESC";
				} else if (code === 0x07) {
					hasBell = true;
				}
				break;

			case "ESC":
				if (code === 0x5d) {
					// ]
					state = "OSC_NUM";
					oscNum = "";
					oscBuf = "";
				} else if (code === 0x5b) {
					// [
					state = "CSI";
				} else {
					state = "NORMAL";
				}
				break;

			case "OSC_NUM":
				if (code === 0x3b) {
					// ;
					const n = parseInt(oscNum, 10);
					state = n === 0 || n === 2 ? "OSC_TITLE" : n === 7 ? "OSC_CWD" : "OSC_SKIP";
				} else if (code >= 0x30 && code <= 0x39) {
					oscNum += text[i];
				} else {
					// Malformed OSC
					state = "NORMAL";
				}
				break;

			case "OSC_TITLE":
				if (code === 0x07) {
					// BEL terminates OSC — not counted as bell
					title = oscBuf;
					state = "NORMAL";
				} else if (code === 0x1b) {
					state = "OSC_ESC";
				} else {
					oscBuf += text[i];
				}
				break;

			case "OSC_CWD":
				if (code === 0x07) {
					cwd = extractPathFromOsc7(oscBuf);
					state = "NORMAL";
				} else if (code === 0x1b) {
					state = "OSC_CWD_ESC";
				} else {
					oscBuf += text[i];
				}
				break;

			case "OSC_CWD_ESC":
				if (code === 0x5c) {
					cwd = extractPathFromOsc7(oscBuf);
				}
				state = "NORMAL";
				break;

			case "OSC_SKIP":
				if (code === 0x07 || code === 0x1b) {
					state = "NORMAL";
				}
				break;

			case "OSC_ESC":
				// Expecting \ for ST (String Terminator)
				if (code === 0x5c) {
					title = oscBuf;
				}
				state = "NORMAL";
				break;

			case "CSI":
				// Terminal character: 0x40-0x7e
				if (code >= 0x40 && code <= 0x7e) {
					state = "NORMAL";
				}
				break;
		}
	}

	return { title, cwd, hasBell };
}
