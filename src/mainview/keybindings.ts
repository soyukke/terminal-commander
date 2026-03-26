export interface NormalizedCombo {
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;
	key: string; // lowercase, e.g. "t", "arrowleft"
}

export type ActionName =
	| "new_tile"
	| "close_tile"
	| "focus_prev"
	| "focus_next"
	| "split_horizontal"
	| "split_vertical"
	| "open_settings";

/**
 * Default keybindings: combo → action (matches config file format).
 */
export const DEFAULT_KEYBINDS: Record<string, ActionName> = {
	"ctrl+shift+t": "new_tile",
	"ctrl+shift+w": "close_tile",
	"ctrl+shift+arrowleft": "focus_prev",
	"ctrl+shift+arrowright": "focus_next",
	"ctrl+shift+h": "split_horizontal",
	"ctrl+shift+v": "split_vertical",
	"meta+.": "open_settings",
};

const MODIFIERS = new Set(["ctrl", "shift", "alt", "meta"]);

/**
 * Parse a combo string like "ctrl+shift+t" into a NormalizedCombo.
 */
export function parseCombo(str: string): NormalizedCombo | null {
	const parts = str.toLowerCase().split("+").map((s) => s.trim());
	if (parts.length === 0) return null;

	const combo: NormalizedCombo = {
		ctrl: false,
		shift: false,
		alt: false,
		meta: false,
		key: "",
	};

	for (const part of parts) {
		if (part === "ctrl") combo.ctrl = true;
		else if (part === "shift") combo.shift = true;
		else if (part === "alt") combo.alt = true;
		else if (part === "meta" || part === "cmd" || part === "super") combo.meta = true;
		else if (!MODIFIERS.has(part)) {
			if (combo.key) return null; // multiple non-modifier keys
			combo.key = part;
		}
	}

	if (!combo.key) return null;
	return combo;
}

/**
 * Check if a KeyboardEvent matches a NormalizedCombo.
 */
export function matchesEvent(combo: NormalizedCombo, e: KeyboardEvent): boolean {
	return (
		e.ctrlKey === combo.ctrl &&
		e.shiftKey === combo.shift &&
		e.altKey === combo.alt &&
		e.metaKey === combo.meta &&
		e.key.toLowerCase() === combo.key
	);
}

/**
 * Resolve user config keybinds over defaults.
 * Config format: combo → action (e.g. { "ctrl+shift+n": "new_tile" }).
 * Returns: action → NormalizedCombo map.
 */
export function resolveKeybindings(
	userConfig: Record<string, string>,
): Map<string, NormalizedCombo> {
	// Build action → combo string map, user overrides defaults
	const actionToCombo = new Map<string, string>();

	// Defaults: combo → action, invert to action → combo
	for (const [combo, action] of Object.entries(DEFAULT_KEYBINDS)) {
		actionToCombo.set(action, combo);
	}

	// User config: combo → action, override
	for (const [combo, action] of Object.entries(userConfig)) {
		actionToCombo.set(action, combo);
	}

	// Parse all combos
	const result = new Map<string, NormalizedCombo>();
	for (const [action, comboStr] of actionToCombo) {
		const parsed = parseCombo(comboStr);
		if (parsed) {
			result.set(action, parsed);
		} else {
			console.warn(`Invalid keybind combo for "${action}": "${comboStr}"`);
		}
	}

	return result;
}

/**
 * Create an xterm.js customKeyEventHandler that intercepts app shortcuts.
 */
export function makeXtermKeyHandler(
	actionMap: Map<string, NormalizedCombo>,
	dispatch: (action: string) => void,
): (e: KeyboardEvent) => boolean {
	return (e: KeyboardEvent): boolean => {
		// Only handle keydown, not keyup
		if (e.type !== "keydown") return true;

		// Let xterm.js handle IME composition events natively
		if (e.isComposing || e.keyCode === 229) return true;

		for (const [action, combo] of actionMap) {
			if (matchesEvent(combo, e)) {
				dispatch(action);
				return false; // prevent xterm from processing
			}
		}
		return true;
	};
}
