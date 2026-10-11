import { describe, expect, it } from "vitest";
import { isNetworkError } from "./connection";

describe("isNetworkError", () => {
	it("recognizes each browser's failed-request error", () => {
		for (const message of [
			"Failed to fetch",
			"NetworkError when attempting to fetch resource.",
			"Load failed",
			"Network request failed",
			"fetch failed",
		])
			expect(isNetworkError(new TypeError(message))).toBe(true);
	});

	it("ignores errors the server sent back", () => {
		expect(isNetworkError(new Error("Picks are locked for this game"))).toBe(
			false,
		);
		expect(isNetworkError(new TypeError("x is undefined"))).toBe(false);
		expect(isNetworkError("Failed to fetch")).toBe(false);
	});
});
