import { describe, test, expect } from "bun:test";
import {
	parseConfigFile,
	resolveConfig,
	configToTerminalOptions,
	DEFAULT_CONFIG,
} from "./config.ts";

describe("parseConfigFile", () => {
	test("parses basic key-value pairs", () => {
		const content = `
font-size = 16
font-family = JetBrains Mono
background = #282c34
`;
		const config = parseConfigFile(content);
		expect(config["font-size"]).toBe(16);
		expect(config["font-family"]).toBe("JetBrains Mono");
		expect(config.background).toBe("#282c34");
	});

	test("ignores comments and empty lines", () => {
		const content = `
# This is a comment
font-size = 14

# Another comment
`;
		const config = parseConfigFile(content);
		expect(config["font-size"]).toBe(14);
		expect(Object.keys(config).length).toBe(1);
	});

	test("parses booleans", () => {
		const content = `
cursor-style-blink = false
copy-on-select = true
`;
		const config = parseConfigFile(content);
		expect(config["cursor-style-blink"]).toBe(false);
		expect(config["copy-on-select"]).toBe(true);
	});

	test("parses env entries", () => {
		const content = `
env = EDITOR=vim
env = LANG=en_US.UTF-8
`;
		const config = parseConfigFile(content);
		expect(config.env).toEqual({
			EDITOR: "vim",
			LANG: "en_US.UTF-8",
		});
	});

	test("parses palette entries", () => {
		const content = `
palette = 0=#000000
palette = 1=#ff0000
`;
		const config = parseConfigFile(content);
		expect(config.palette).toEqual({
			0: "#000000",
			1: "#ff0000",
		});
	});

	test("parses keybind entries", () => {
		const content = `
keybind = ctrl+t = new_tab
keybind = ctrl+w = close_tab
`;
		const config = parseConfigFile(content);
		expect(config.keybind).toEqual({
			"ctrl+t": "new_tab",
			"ctrl+w": "close_tab",
		});
	});

	test("handles float values", () => {
		const content = `background-opacity = 0.85`;
		const config = parseConfigFile(content);
		expect(config["background-opacity"]).toBe(0.85);
	});
});

describe("resolveConfig", () => {
	test("returns defaults when no overrides", () => {
		const config = resolveConfig({});
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	test("overrides specific values", () => {
		const config = resolveConfig({ "font-size": 16, background: "#000" });
		expect(config["font-size"]).toBe(16);
		expect(config.background).toBe("#000");
		expect(config["font-family"]).toBe(DEFAULT_CONFIG["font-family"]);
	});

	test("deep merges palette", () => {
		const config = resolveConfig({ palette: { 0: "#111111" } });
		expect(config.palette[0]).toBe("#111111");
		expect(config.palette[1]).toBe(DEFAULT_CONFIG.palette[1]);
	});

	test("deep merges env", () => {
		const config = resolveConfig({ env: { FOO: "bar" } });
		expect(config.env.FOO).toBe("bar");
	});
});

describe("configToTerminalOptions", () => {
	test("converts config to xterm.js options", () => {
		const opts = configToTerminalOptions(DEFAULT_CONFIG);
		expect(opts.fontSize).toBe(13);
		expect(opts.cursorBlink).toBe(true);
		expect(opts.cursorStyle).toBe("bar");
		expect(opts.theme?.background).toBe("#1a1b26");
		expect(opts.theme?.foreground).toBe("#c0caf5");
	});

	test("maps cursor styles correctly", () => {
		const block = configToTerminalOptions({
			...DEFAULT_CONFIG,
			"cursor-style": "block",
		});
		expect(block.cursorStyle).toBe("block");

		const underline = configToTerminalOptions({
			...DEFAULT_CONFIG,
			"cursor-style": "underline",
		});
		expect(underline.cursorStyle).toBe("underline");
	});
});
