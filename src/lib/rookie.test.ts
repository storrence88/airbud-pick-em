import { describe, expect, it } from "vitest";
import { rookieTasks } from "./rookie";

const base = {
	picks: 0,
	hasLock: false,
	hasTiebreaker: false,
	favoriteTeam: null,
	installed: false,
	phone: true,
};

describe("rookieTasks", () => {
	it("starts with nothing done", () => {
		const tasks = rookieTasks(base);
		expect(tasks).toHaveLength(5);
		expect(tasks.every((t) => !t.done)).toBe(true);
	});

	it("ticks off what the player has done", () => {
		const tasks = rookieTasks({
			...base,
			picks: 3,
			hasLock: true,
			favoriteTeam: "KC",
		});
		expect(tasks.filter((t) => t.done).map((t) => t.id)).toEqual([
			"pick",
			"lock",
			"team",
		]);
	});

	it("leaves out the home screen step on a computer", () => {
		expect(
			rookieTasks({ ...base, phone: false }).map((t) => t.id),
		).not.toContain("install");
	});

	it("keeps it once installed, even on a big screen", () => {
		const install = rookieTasks({
			...base,
			phone: false,
			installed: true,
		}).find((t) => t.id === "install");
		expect(install?.done).toBe(true);
	});
});
