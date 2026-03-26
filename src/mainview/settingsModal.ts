import {
	type AppConfig,
	type FieldMeta,
	CONFIG_FIELD_METADATA,
	CONFIG_SECTIONS,
} from "../shared/config.ts";

let activeOverlay: HTMLElement | null = null;

type OnPreview = (config: AppConfig) => void;
type OnSave = (config: AppConfig) => Promise<void>;

/**
 * Toggle settings modal. If already open, close it. If closed, open it.
 */
export function toggleSettingsModal(
	currentConfig: AppConfig,
	onPreview: OnPreview,
	onSave: OnSave,
): void {
	if (activeOverlay) {
		activeOverlay.remove();
		activeOverlay = null;
		return;
	}
	openSettingsModal(currentConfig, onPreview, onSave);
}

function openSettingsModal(
	currentConfig: AppConfig,
	onPreview: OnPreview,
	onSave: OnSave,
): void {
	const originalConfig: AppConfig = JSON.parse(JSON.stringify(currentConfig));
	const workingConfig: AppConfig = JSON.parse(JSON.stringify(currentConfig));

	// --- Overlay ---
	const overlay = document.createElement("div");
	overlay.className = "settings-overlay";
	activeOverlay = overlay;
	overlay.addEventListener("mousedown", (e) => {
		if (e.target === overlay) closeModal(false);
	});

	// --- Modal ---
	const modal = document.createElement("div");
	modal.className = "settings-modal";

	// Header
	const header = document.createElement("div");
	header.className = "settings-header";
	const title = document.createElement("span");
	title.className = "settings-title";
	title.textContent = "Settings";
	const closeBtn = document.createElement("button");
	closeBtn.className = "settings-close";
	closeBtn.innerHTML = "&times;";
	closeBtn.addEventListener("click", () => closeModal(false));
	header.appendChild(title);
	header.appendChild(closeBtn);
	modal.appendChild(header);

	// Tabs
	const tabBar = document.createElement("div");
	tabBar.className = "settings-tabs";
	const panels: HTMLElement[] = [];

	for (let i = 0; i < CONFIG_SECTIONS.length; i++) {
		const section = CONFIG_SECTIONS[i];
		const tab = document.createElement("button");
		tab.className = "settings-tab" + (i === 0 ? " active" : "");
		tab.textContent = section.label;

		const panel = document.createElement("div");
		panel.className = "settings-tab-content";
		panel.style.display = i === 0 ? "flex" : "none";

		for (const field of section.fields) {
			const meta = CONFIG_FIELD_METADATA[field];
			if (!meta) continue;
			const value = workingConfig[field];
			const row = createField(meta, value, (v) => {
				(workingConfig as any)[field] = v;
				onPreview(workingConfig);
			});
			panel.appendChild(row);
		}

		tab.addEventListener("click", () => {
			tabBar.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
			tab.classList.add("active");
			panels.forEach((p) => (p.style.display = "none"));
			panel.style.display = "flex";
		});

		tabBar.appendChild(tab);
		panels.push(panel);
	}
	modal.appendChild(tabBar);

	const panelContainer = document.createElement("div");
	panelContainer.className = "settings-panels";
	for (const p of panels) panelContainer.appendChild(p);
	modal.appendChild(panelContainer);

	// Footer
	const footer = document.createElement("div");
	footer.className = "settings-footer";

	const cancelBtn = document.createElement("button");
	cancelBtn.className = "settings-btn settings-btn-cancel";
	cancelBtn.textContent = "Cancel";
	cancelBtn.addEventListener("click", () => closeModal(false));

	const saveBtn = document.createElement("button");
	saveBtn.className = "settings-btn settings-btn-save";
	saveBtn.textContent = "Save";
	saveBtn.addEventListener("click", () => closeModal(true));

	footer.appendChild(cancelBtn);
	footer.appendChild(saveBtn);
	modal.appendChild(footer);

	overlay.appendChild(modal);
	document.body.appendChild(overlay);

	// Keyboard
	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			closeModal(false);
		}
	};
	document.addEventListener("keydown", onKeyDown);

	function closeModal(save: boolean): void {
		document.removeEventListener("keydown", onKeyDown);
		if (activeOverlay) {
			activeOverlay.remove();
			activeOverlay = null;
		}

		if (save) {
			onSave(workingConfig).catch(console.error);
		} else {
			// Rollback preview
			onPreview(originalConfig);
		}
	}
}

function createField(
	meta: FieldMeta,
	value: unknown,
	onChange: (v: string | number | boolean) => void,
): HTMLElement {
	const row = document.createElement("div");
	row.className = "settings-field";

	const label = document.createElement("label");
	label.className = "settings-label";
	label.textContent = meta.label;
	row.appendChild(label);

	switch (meta.type) {
		case "text": {
			const input = document.createElement("input");
			input.type = "text";
			input.className = "settings-input";
			input.value = String(value ?? "");
			input.addEventListener("input", () => onChange(input.value));
			row.appendChild(input);
			break;
		}
		case "number": {
			const input = document.createElement("input");
			input.type = "number";
			input.className = "settings-input";
			input.value = String(value ?? 0);
			if (meta.min !== undefined) input.min = String(meta.min);
			if (meta.max !== undefined) input.max = String(meta.max);
			if (meta.step !== undefined) input.step = String(meta.step);
			input.addEventListener("input", () => {
				const v = parseFloat(input.value);
				if (!isNaN(v)) onChange(v);
			});
			row.appendChild(input);
			break;
		}
		case "boolean": {
			const input = document.createElement("input");
			input.type = "checkbox";
			input.className = "settings-checkbox";
			input.checked = Boolean(value);
			input.addEventListener("change", () => onChange(input.checked));
			row.appendChild(input);
			break;
		}
		case "select": {
			const select = document.createElement("select");
			select.className = "settings-select";
			for (const opt of meta.options) {
				const option = document.createElement("option");
				option.value = opt;
				option.textContent = opt;
				if (opt === String(value)) option.selected = true;
				select.appendChild(option);
			}
			select.addEventListener("change", () => onChange(select.value));
			row.appendChild(select);
			break;
		}
		case "color": {
			const wrapper = document.createElement("div");
			wrapper.className = "settings-color-wrapper";

			const input = document.createElement("input");
			input.type = "color";
			input.className = "settings-input settings-color-input";
			input.value = String(value ?? "#000000");

			const hex = document.createElement("span");
			hex.className = "settings-color-hex";
			hex.textContent = String(value ?? "#000000");

			input.addEventListener("input", () => {
				hex.textContent = input.value;
				onChange(input.value);
			});

			wrapper.appendChild(input);
			wrapper.appendChild(hex);
			row.appendChild(wrapper);
			break;
		}
	}

	return row;
}
