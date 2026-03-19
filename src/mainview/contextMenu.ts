import type { AppConfig } from "../shared/config.ts";

let activeMenu: HTMLElement | null = null;
let activeCleanup: (() => void) | null = null;

function closeMenu(): void {
	if (activeMenu) {
		activeMenu.remove();
		activeMenu = null;
	}
	if (activeCleanup) {
		activeCleanup();
		activeCleanup = null;
	}
}

export interface ContextMenuCallbacks {
	onRename: () => void;
	onColorChange: (color: string) => void;
}

/**
 * Build preset color list from config palette.
 */
function buildPresetColors(palette: AppConfig["palette"]): { name: string; value: string }[] {
	return [
		{ name: "Blue", value: palette[4] },
		{ name: "Purple", value: palette[5] },
		{ name: "Cyan", value: palette[6] },
		{ name: "Green", value: palette[2] },
		{ name: "Yellow", value: palette[3] },
		{ name: "Orange", value: palette[1] },
		{ name: "Red", value: palette[9] || palette[1] },
		{ name: "Gray", value: palette[8] },
	];
}

export function showTileContextMenu(
	x: number,
	y: number,
	currentColor: string,
	palette: AppConfig["palette"],
	callbacks: ContextMenuCallbacks,
): void {
	closeMenu();

	const presets = buildPresetColors(palette);
	const menu = document.createElement("div");
	menu.className = "context-menu";
	menu.style.left = `${x}px`;
	menu.style.top = `${y}px`;

	// Rename option
	const renameItem = document.createElement("div");
	renameItem.className = "context-menu-item";
	renameItem.textContent = "Rename";
	renameItem.addEventListener("click", () => {
		closeMenu();
		callbacks.onRename();
	});
	menu.appendChild(renameItem);

	// Separator
	const sep = document.createElement("div");
	sep.className = "context-menu-separator";
	menu.appendChild(sep);

	// Color label
	const colorLabel = document.createElement("div");
	colorLabel.className = "context-menu-label";
	colorLabel.textContent = "Color";
	menu.appendChild(colorLabel);

	// Color swatches
	const swatches = document.createElement("div");
	swatches.className = "context-menu-swatches";

	for (const preset of presets) {
		const swatch = document.createElement("div");
		swatch.className = "context-menu-swatch";
		if (preset.value === currentColor) {
			swatch.classList.add("active");
		}
		swatch.style.backgroundColor = preset.value;
		swatch.title = preset.name;
		swatch.addEventListener("click", () => {
			closeMenu();
			callbacks.onColorChange(preset.value);
		});
		swatches.appendChild(swatch);
	}

	menu.appendChild(swatches);
	document.body.appendChild(menu);
	activeMenu = menu;

	// Keep menu within viewport
	requestAnimationFrame(() => {
		const rect = menu.getBoundingClientRect();
		if (rect.right > window.innerWidth) {
			menu.style.left = `${window.innerWidth - rect.width - 4}px`;
		}
		if (rect.bottom > window.innerHeight) {
			menu.style.top = `${window.innerHeight - rect.height - 4}px`;
		}
	});

	// Close on click outside — cleanup is managed by closeMenu()
	const onClickOutside = (e: MouseEvent) => {
		if (!menu.contains(e.target as Node)) {
			closeMenu();
		}
	};
	setTimeout(() => document.addEventListener("mousedown", onClickOutside), 0);
	activeCleanup = () => document.removeEventListener("mousedown", onClickOutside);
}
