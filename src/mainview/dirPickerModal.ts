type RPC = {
	request: {
		browseDirectory: (params: { startingFolder?: string }) => Promise<{ path: string | null }>;
		getRecentDirs: (params: {}) => Promise<{ dirs: string[] }>;
		saveRecentDir: (params: { dir: string }) => Promise<{ success: boolean }>;
	};
};

/**
 * Show a modal to pick a working directory.
 * Returns the selected path, or null if cancelled.
 */
export async function showDirPickerModal(rpc: RPC): Promise<string | null> {
	const { dirs: recentDirs } = await rpc.request.getRecentDirs({});

	return new Promise<string | null>((resolve) => {
		let resolved = false;
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
			if (e.target === overlay) finish(null);
		});

		// Modal
		const modal = document.createElement("div");
		modal.className = "dir-picker-modal";

		// Title
		const title = document.createElement("div");
		title.className = "dir-picker-title";
		title.textContent = "Working Directory";
		modal.appendChild(title);

		// Recent dirs list
		if (recentDirs.length > 0) {
			const label = document.createElement("div");
			label.className = "dir-picker-label";
			label.textContent = "Recent";
			modal.appendChild(label);

			const list = document.createElement("div");
			list.className = "dir-picker-list";

			for (const dir of recentDirs) {
				const item = document.createElement("div");
				item.className = "dir-picker-item";

				const dirName = dir.split("/").filter(Boolean).pop() || dir;
				const dirPath = dir;

				const nameEl = document.createElement("span");
				nameEl.className = "dir-picker-item-name";
				nameEl.textContent = dirName;

				const pathEl = document.createElement("span");
				pathEl.className = "dir-picker-item-path";
				pathEl.textContent = dirPath;

				item.appendChild(nameEl);
				item.appendChild(pathEl);
				item.addEventListener("click", () => finish(dir));
				list.appendChild(item);
			}

			modal.appendChild(list);
		} else {
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
			const { path } = await rpc.request.browseDirectory({});
			if (path) finish(path);
		});
		modal.appendChild(browseBtn);

		// Cancel button
		const cancelBtn = document.createElement("button");
		cancelBtn.className = "dir-picker-cancel";
		cancelBtn.textContent = "Cancel";
		cancelBtn.addEventListener("click", () => finish(null));
		modal.appendChild(cancelBtn);

		overlay.appendChild(modal);
		document.body.appendChild(overlay);

		// Keyboard handling
		onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") finish(null);
		};
		document.addEventListener("keydown", onKeyDown);
	});
}
