import { describe, expect, it } from "vitest";
import type { Game } from "./types";
import { rolloverAfter, weekIsOver } from "./week";

const game = (kickoff: string, state: Game["state"], week = 6) => ({
	week,
	kickoff,
	state,
});

// Week 6 of 2026: Thursday night opener, Sunday slate, Monday night.
const week6 = (mnf: Game["state"]) => [
	game("2026-10-16T00:15Z", "post"), // Thu 8:15 PM ET
	game("2026-10-18T17:00Z", "post"), // Sun 1 PM ET
	game("2026-10-20T00:15Z", mnf), // Mon 8:15 PM ET
];

describe("rolloverAfter", () => {
	it("is 6 AM Eastern on the Tuesday after a kickoff (EDT)", () => {
		// Thursday night in ET is already Friday in UTC.
		expect(new Date(rolloverAfter("2026-10-16T00:15Z")).toISOString()).toBe(
			"2026-10-20T10:00:00.000Z",
		);
	});

	it("handles standard time", () => {
		expect(new Date(rolloverAfter("2026-12-03T18:00Z")).toISOString()).toBe(
			"2026-12-08T11:00:00.000Z",
		);
	});

	it("crosses the end of daylight saving", () => {
		// Thu Oct 29, week ends Tue Nov 3 after clocks fall back.
		expect(new Date(rolloverAfter("2026-10-30T00:15Z")).toISOString()).toBe(
			"2026-11-03T11:00:00.000Z",
		);
	});
});

describe("weekIsOver", () => {
	it("waits while Monday night hasn't finished", () => {
		expect(weekIsOver(week6("in"), new Date("2026-10-20T02:30Z"))).toBe(false);
	});

	it("rolls over as soon as every game is final", () => {
		expect(weekIsOver(week6("post"), new Date("2026-10-20T03:30Z"))).toBe(true);
	});

	it("rolls over on Sunday night in a week with no Monday game", () => {
		const games = week6("post").slice(0, 2);
		expect(weekIsOver(games, new Date("2026-10-19T03:00Z"))).toBe(true);
	});

	it("rolls over Tuesday morning even with a game stuck unfinished", () => {
		expect(weekIsOver(week6("pre"), new Date("2026-10-20T09:59Z"))).toBe(false);
		expect(weekIsOver(week6("pre"), new Date("2026-10-20T10:00Z"))).toBe(true);
	});

	it("never rolls past week 18", () => {
		const games = [game("2027-01-10T18:00Z", "post", 18)];
		expect(weekIsOver(games, new Date("2027-01-20T12:00Z"))).toBe(false);
	});

	it("ignores an empty week", () => {
		expect(weekIsOver([], new Date())).toBe(false);
	});
});
