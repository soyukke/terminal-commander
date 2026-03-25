type RPC = {
	request: {
		browseDirectory: (params: { startingFolder?: string }) => Promise<{ path: string | null }>;
		getRecentDirs: (params: {}) => Promise<{ dirs: string[] }>;
		saveRecentDir: (params: { dir: string }) => Promise<{ success: boolean }>;
	};
};

/** Create a clickable directory item element */
function createDirItem(dir: string, onClick: () => void): HTMLElement {
	const item = document.createElement("div");
	item.className = "dir-picker-item";

	const dirName = dir.split("/").filter(Boolean).pop() || dir;

	const nameEl = document.createElement("span");
	nameEl.className = "dir-picker-item-name";
	nameEl.textContent = dirName;

	const pathEl = document.createElement("span");
	pathEl.className = "dir-picker-item-path";
	pathEl.textContent = dir;

	item.appendChild(nameEl);
	item.appendChild(pathEl);
	item.addEventListener("click", onClick);
	return item;
}

/**
 * Show a modal to pick a working directory.
 * Returns the selected path, or null if cancelled.
 */
export async function showDirPickerModal(
	rpc: RPC,
	focusedCwd?: string,
): Promise<string | null> {
	const { dirs: recentDirs } = await rpc.request.getRecentDirs({});

	return new Promise<string | null>((resolve) => {
		let resolved = false;
		let browsing = false;
		let onKeyDown: (e: KeyboardEvent) => void;
		const finish = (result: string | null) => {
			if (resolved) return;
			resolved = true;
			document.removeEventListener("keydown", onKeyDown);
			overlay.remove();
			resolve(result);
		};

		// Overlay
		const overlay = document.createElement("div");
		overlay.className = "dir-picker-overlay";
		overlay.addEventListener("mousedown", (e) => {
			if (e.target === overlay && !browsing) finish(null);
		});

		// Modal
		const modal = document.createElement("div");
		modal.className = "dir-picker-modal";

		// Title
		const title = document.createElement("div");
		title.className = "dir-picker-title";
		title.textContent = "Working Directory";
		modal.appendChild(title);

		// --- Current directory (from focused tile) ---
		if (focusedCwd) {
			const label = document.createElement("div");
			label.className = "dir-picker-label";
			label.textContent = "Current";
			modal.appendChild(label);

			const item = createDirItem(focusedCwd, () => finish(focusedCwd));
			item.classList.add("dir-picker-item--current");
			modal.appendChild(item);

			const sep = document.createElement("div");
			sep.className = "dir-picker-separator";
			modal.appendChild(sep);
		}

		// --- Recent dirs list ---
		const filteredRecent = recentDirs.filter((d) => d !== focusedCwd);
		if (filteredRecent.length > 0) {
			const label = document.createElement("div");
			label.className = "dir-picker-label";
			label.textContent = "Recent";
			modal.appendChild(label);

			const list = document.createElement("div");
			list.className = "dir-picker-list";

			for (const dir of filteredRecent) {
				list.appendChild(createDirItem(dir, () => finish(dir)));
			}

			modal.appendChild(list);
		} else if (!focusedCwd) {
			const empty = document.createElement("div");
			empty.className = "dir-picker-empty";
			empty.textContent = "No recent directories";
			modal.appendChild(empty);
		}

		// Separator
		const sep = document.createElement("div");
		sep.className = "dir-picker-separator";
		modal.appendChild(sep);

		// Browse button
		const browseBtn = document.createElement("button");
		browseBtn.className = "dir-picker-browse";
		browseBtn.textContent = "Browse...";
		browseBtn.addEventListener("click", async () => {
			browsing = true;
			try {
				const { path } = await rpc.request.browseDirectory({
					startingFolder: focusedCwd,
				});
				if (path) finish(path);
			} catch {
				// RPC timeout or error — user can retry or cancel
			} finally {
				browsing = false;
			}
		});
		modal.appendChild(browseBtn);

		// Cancel button
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "dir-picker-cancel";
		cancelBtn.textContent = "Cancel";
		cancelBtn.addEventListener("click", () => {
			if (!browsing) finish(null);
		});
		modal.appendChild(cancelBtn);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		// Keyboard handling
		onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !browsing) finish(null);
		};
		document.addEventListener("keydown", onKeyDown);
	});
}
