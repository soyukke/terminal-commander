const HOME_RE = /^(\/Users\/[^/]+|\/home\/[^/]+)/;

export function shortenPath(path: string): string {
	const homeMatch = path.match(HOME_RE);
	if (homeMatch) {
		return "~" + path.slice(homeMatch[1].length);
	}
	return path;
}
