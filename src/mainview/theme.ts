export const TOKYO_NIGHT_THEME = {
	background: "#1a1b26",
	foreground: "#c0caf5",
	cursor: "#c0caf5",
	selectionBackground: "#33467c",
	black: "#15161e",
	red: "#f7768e",
	green: "#9ece6a",
	yellow: "#e0af68",
	blue: "#7aa2f7",
	magenta: "#bb9af7",
	cyan: "#7dcfff",
	white: "#a9b1d6",
	brightBlack: "#414868",
	brightRed: "#f7768e",
	brightGreen: "#9ece6a",
	brightYellow: "#e0af68",
	brightBlue: "#7aa2f7",
	brightMagenta: "#bb9af7",
	brightCyan: "#7dcfff",
	brightWhite: "#c0caf5",
} as const;

export const DEFAULT_TILE_COLOR = TOKYO_NIGHT_THEME.blue;

export const TERMINAL_OPTIONS = {
	cursorBlink: true,
	fontSize: 13,
	fontFamily: '"MesloLGS NF", Menlo, Monaco, "Courier New", monospace',
	theme: TOKYO_NIGHT_THEME,
} as const;
