import { describe, test, expect } from "bun:test";
import { shortenPath } from "./pathUtils.ts";

describe("shortenPath", () => {
	test("shortens macOS home directory", () => {
		expect(shortenPath("/Users/soyukke/dev/project")).toBe("~/dev/project");
	});

	test("shortens Linux home directory", () => {
		expect(shortenPath("/home/user/workspace")).toBe("~/workspace");
	});

	test("returns ~ for home directory itself", () => {
		expect(shortenPath("/Users/soyukke")).toBe("~");
	});

	test("returns ~/subdir for one level deep", () => {
		expect(shortenPath("/Users/soyukke/Documents")).toBe("~/Documents");
	});

	test("does not shorten non-home paths", () => {
		expect(shortenPath("/tmp/build")).toBe("/tmp/build");
		expect(shortenPath("/var/log")).toBe("/var/log");
		expect(shortenPath("/opt/app")).toBe("/opt/app");
	});

	test("does not shorten root", () => {
		expect(shortenPath("/")).toBe("/");
	});

	test("handles empty string", () => {
		expect(shortenPath("")).toBe("");
	});

	test("handles paths with spaces", () => {
		expect(shortenPath("/Users/user name/my project")).toBe("~/my project");
	});
});
