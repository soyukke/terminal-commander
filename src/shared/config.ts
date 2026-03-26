export interface AppConfig {
	// Font
	"font-family": string;
	"font-size": number;

	// Theme & Colors
	theme: string;
	background: string;
	foreground: string;
	"cursor-color": string;
	"selection-background": string;
	"selection-foreground": string;
	"palette": Record<number, string>;

	// Cursor
	"cursor-style": "block" | "bar" | "underline";
	"cursor-style-blink": boolean;

	// Window
	"window-width": number;
	"window-height": number;
	"window-padding-x": number;
	"window-padding-y": number;

	// Background
	"background-opacity": number;

	// Shell & Command
	command: string;
	"working-directory": string;
	env: Record<string, string>;

	// Behavior
	"confirm-close-surface": boolean;
	"scrollback-limit": number;
	"copy-on-select": boolean;
	"mouse-hide-while-typing": boolean;

	// Keybindings
	keybind: Record<string, string>;

	// Inspector (E2E testing)
	"inspector-port": number;
}

export const DEFAULT_CONFIG: AppConfig = {
	// Font
	"font-family": '"CaskaydiaCove Nerd Font Mono", Menlo, "Hiragino Kaku Gothic ProN", "Hiragino Sans", monospace',
	"font-size": 13,

	// Theme & Colors
	theme: "tokyo-night",
	background: "#1a1b26",
	foreground: "#c0caf5",
	"cursor-color": "#c0caf5",
	"selection-background": "#33467c",
	"selection-foreground": "",
	palette: {
		0: "#15161e",
		1: "#f7768e",
		2: "#9ece6a",
		3: "#e0af68",
		4: "#7aa2f7",
		5: "#bb9af7",
		6: "#7dcfff",
		7: "#a9b1d6",
		8: "#414868",
		9: "#f7768e",
		10: "#9ece6a",
		11: "#e0af68",
		12: "#7aa2f7",
		13: "#bb9af7",
		14: "#7dcfff",
		15: "#c0caf5",
	},

	// Cursor
	"cursor-style": "bar",
	"cursor-style-blink": true,

	// Window
	"window-width": 1200,
	"window-height": 800,
	"window-padding-x": 4,
	"window-padding-y": 4,

	// Background
	"background-opacity": 1.0,

	// Shell & Command
	command: "claude",
	"working-directory": "",
	env: {},

	// Behavior
	"confirm-close-surface": true,
	"scrollback-limit": 10000,
	"copy-on-select": false,
	"mouse-hide-while-typing": false,

	// Keybindings
	keybind: {},

	// Inspector (E2E testing) — 0 = disabled
	"inspector-port": 0,
};

/**
 * Split a value on the first `=` sign, returning [key, value] or null.
 */
function splitKeyValue(value: string): [string, string] | null {
	const eq = value.indexOf("=");
	if (eq === -1) return null;
	return [value.slice(0, eq).trim(), value.slice(eq + 1).trim()];
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/**
 * Parse a Ghostty-style config file.
 * Format: key = value (one per line), # for comments
 */
export function parseConfigFile(content: string): Partial<AppConfig> {
	const config: Record<string, unknown> = {};
	const envEntries: Record<string, string> = {};
	const paletteEntries: Record<number, string> = {};
	const keybindEntries: Record<string, string> = {};

	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const pair = splitKeyValue(line);
		if (!pair) continue;
		const [key, value] = pair;

		// Handle repeatable keys
		if (key === "env") {
			const kv = splitKeyValue(value);
			if (kv) envEntries[kv[0]] = kv[1];
			continue;
		}

		if (key === "palette") {
			const kv = splitKeyValue(value);
			if (kv) {
				const idx = parseInt(kv[0], 10);
				if (!isNaN(idx)) paletteEntries[idx] = kv[1];
			}
			continue;
		}

		if (key === "keybind") {
			const kv = splitKeyValue(value);
			if (kv) keybindEntries[kv[0]] = kv[1];
			continue;
		}

		// Type coercion
		if (value === "true") {
			config[key] = true;
		} else if (value === "false") {
			config[key] = false;
		} else if (NUMBER_RE.test(value)) {
			config[key] = parseFloat(value);
		} else {
			// Strip surrounding quotes (single or double)
			const unquoted = value.length >= 2
				&& ((value[0] === '"' && value[value.length - 1] === '"')
					|| (value[0] === "'" && value[value.length - 1] === "'"))
				? value.slice(1, -1)
				: value;
			config[key] = unquoted;
		}
	}

	if (Object.keys(envEntries).length > 0) config.env = envEntries;
	if (Object.keys(paletteEntries).length > 0) config.palette = paletteEntries;
	if (Object.keys(keybindEntries).length > 0) config.keybind = keybindEntries;

	return config as Partial<AppConfig>;
}

/**
 * Merge user config over defaults, producing a complete config.
 */
export function resolveConfig(userConfig: Partial<AppConfig>): AppConfig {
	const merged = { ...DEFAULT_CONFIG, ...userConfig };

	// Deep merge for nested objects
	merged.palette = { ...DEFAULT_CONFIG.palette, ...userConfig.palette };
	merged.env = { ...DEFAULT_CONFIG.env, ...userConfig.env };
	merged.keybind = { ...DEFAULT_CONFIG.keybind, ...userConfig.keybind };

	return merged;
}

/**
 * Convert AppConfig to xterm.js Terminal options.
 */
export function configToTerminalOptions(config: AppConfig) {
	return {
		cursorBlink: config["cursor-style-blink"],
		cursorStyle: config["cursor-style"],
		fontSize: config["font-size"],
		fontFamily: config["font-family"],
		scrollback: config["scrollback-limit"],
		theme: {
			background: config.background,
			foreground: config.foreground,
			cursor: config["cursor-color"] || config.foreground,
			selectionBackground: config["selection-background"] || undefined,
			selectionForeground: config["selection-foreground"] || undefined,
			black: config.palette[0],
			red: config.palette[1],
			green: config.palette[2],
			yellow: config.palette[3],
			blue: config.palette[4],
			magenta: config.palette[5],
			cyan: config.palette[6],
			white: config.palette[7],
			brightBlack: config.palette[8],
			brightRed: config.palette[9],
			brightGreen: config.palette[10],
			brightYellow: config.palette[11],
			brightBlue: config.palette[12],
			brightMagenta: config.palette[13],
			brightCyan: config.palette[14],
			brightWhite: config.palette[15],
		},
	};
}
