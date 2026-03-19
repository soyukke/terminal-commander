export function createTileElement(
	tileName: string,
	onRename?: (tileId: string, newName: string) => void
): {
	tileEl: HTMLElement;
	body: HTMLElement;
	closeBtn: HTMLElement;
	nameSpan: HTMLElement;
	badgeSpan: HTMLElement;
} {
	const tileEl = document.createElement("div");
	tileEl.className = "tile";

	const header = document.createElement("div");
	header.className = "tile-header";

	const nameSpan = document.createElement("span");
	nameSpan.className = "tile-name";
	nameSpan.textContent = tileName;

	nameSpan.addEventListener("dblclick", () => {
		const input = document.createElement("input");
		input.type = "text";
		input.value = nameSpan.textContent || "";
		input.style.cssText =
			"background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--accent);font-size:11px;padding:1px 4px;width:100%;";

		let committed = false;
		const commit = () => {
			if (committed) return;
			committed = true;
			const newName = input.value.trim();
			if (newName) {
				nameSpan.textContent = newName;
				const tileId = tileEl.dataset.tileId;
				if (tileId && onRename) onRename(tileId, newName);
			}
			input.replaceWith(nameSpan);
		};

		input.addEventListener("blur", commit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") commit();
			if (e.key === "Escape") input.replaceWith(nameSpan);
		});

		nameSpan.replaceWith(input);
		input.focus();
		input.select();
	});

	const badgeSpan = document.createElement("span");
	badgeSpan.className = "tile-badge";
	badgeSpan.textContent = "\u25cf"; // ●
	badgeSpan.hidden = true;

	const closeBtn = document.createElement("span");
	closeBtn.className = "tile-close";
	closeBtn.textContent = "\u00d7";

	header.appendChild(nameSpan);
	header.appendChild(badgeSpan);
	header.appendChild(closeBtn);

	const body = document.createElement("div");
	body.className = "tile-body";

	tileEl.appendChild(header);
	tileEl.appendChild(body);

	return { tileEl, body, closeBtn, nameSpan, badgeSpan };
}
