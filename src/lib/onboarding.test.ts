import { describe, expect, it } from "vitest";
import { dotVisible, isVeteran, NEW_DOT_DAYS, RELEASE } from "./onboarding";

const old = { createdAt: "2026-09-01T00:00:00Z" };
const fresh = { createdAt: "2026-10-20T00:00:00Z" };

describe("isVeteran", () => {
	it("goes by account age", () => {
		expect(isVeteran(old, {})).toBe(true);
		expect(isVeteran(fresh, {})).toBe(false);
		expect(isVeteran(null, {})).toBe(false);
	});

	it("the profile override wins, so anyone can be reset to new", () => {
		expect(isVeteran(old, { player: "new" })).toBe(false);
		expect(isVeteran(fresh, { player: "veteran" })).toBe(true);
	});
});

describe("dotVisible", () => {
	const since = Date.parse("2026-10-11T12:00:00Z");
	const dots = { release: RELEASE, since, seen: ["share" as const] };

	it("shows until tapped", () => {
		expect(dotVisible({}, "share")).toBe(true);
		expect(dotVisible({ dots }, "share", since)).toBe(false);
		expect(dotVisible({ dots }, "survivor", since)).toBe(true);
	});

	it("fades out after a couple of weeks", () => {
		const later = since + (NEW_DOT_DAYS + 1) * 86_400_000;
		expect(dotVisible({ dots }, "survivor", later)).toBe(false);
	});

	it("starts over for a new release", () => {
		expect(
			dotVisible({ dots: { ...dots, release: "older" } }, "share", since),
		).toBe(true);
	});
});
