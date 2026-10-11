import { describe, expect, it } from "vitest";
import {
	discordTime,
	dueSlate,
	easternTime,
	reminderMessage,
	slateOf,
} from "./reminders";

// Week 6, 2026: Thursday night, a London game, the Sunday slate, Monday night.
const games = [
	{ id: "tnf", kickoff: "2026-10-09T00:15:00Z" },
	{ id: "london", kickoff: "2026-10-11T13:30:00Z" },
	{ id: "early", kickoff: "2026-10-11T17:00:00Z" },
	{ id: "snf", kickoff: "2026-10-12T00:20:00Z" },
	{ id: "mnf", kickoff: "2026-10-13T00:15:00Z" },
];

describe("slateOf", () => {
	it("groups by the US Eastern date, so night games stay on their day", () => {
		expect(slateOf("2026-10-09T00:15:00Z")).toBe("2026-10-08");
		expect(slateOf("2026-10-12T00:20:00Z")).toBe("2026-10-11");
	});
});

describe("dueSlate", () => {
	it("is due within a few hours of the day's first kickoff", () => {
		const slate = dueSlate(games, new Date("2026-10-11T11:00:00Z"));
		expect(slate?.id).toBe("2026-10-11");
		expect(slate?.firstKickoff).toBe("2026-10-11T13:30:00.000Z");
		expect(slate?.games.map((g) => g.id)).toEqual(["london", "early", "snf"]);
	});

	it("isn't due too early or once the day has started", () => {
		expect(dueSlate(games, new Date("2026-10-11T09:00:00Z"))).toBeNull();
		expect(dueSlate(games, new Date("2026-10-11T14:00:00Z"))).toBeNull();
	});

	it("gives Thursday and Monday nights their own reminder", () => {
		expect(dueSlate(games, new Date("2026-10-08T22:00:00Z"))?.id).toBe(
			"2026-10-08",
		);
		const monday = dueSlate(games, new Date("2026-10-12T22:30:00Z"));
		expect(monday?.games.map((g) => g.id)).toEqual(["mnf"]);
	});

	it("takes a wider window when asked", () => {
		expect(dueSlate(games, new Date("2026-10-11T03:00:00Z"), 12)?.id).toBe(
			"2026-10-11",
		);
	});
});

describe("formatting", () => {
	it("shows Eastern time for email and a Discord timestamp for DMs", () => {
		expect(easternTime("2026-10-11T17:00:00Z")).toBe("1:00 PM ET");
		expect(discordTime("2026-10-11T17:00:00Z")).toBe("<t:1791738000:R>");
	});
});

describe("reminderMessage", () => {
	const leagues = [
		{ name: "Sunday Scaries", games: [{ away: "BUF", home: "KC" }] },
		{
			name: "Work league",
			games: [
				{ away: "BUF", home: "KC" },
				{ away: "DAL", home: "PHI" },
			],
		},
	];

	it("counts and lists only the reader's own open games", () => {
		const msg = reminderMessage({
			name: "Nate",
			style: "gentle",
			when: "1:00 PM ET",
			leagues,
			seed: "2026-10-11:nate",
		});
		expect(msg.subject).toBe("3 open picks today");
		expect(msg.intro).toMatch(/^Nate, /);
		expect(msg.intro).toContain("3");
		expect(msg.intro).toContain("1:00 PM ET");
		expect(msg.games).toEqual([
			"Sunday Scaries: BUF @ KC",
			"Work league: BUF @ KC, DAL @ PHI",
		]);
	});

	it("roasts on request and skips the league name for one league", () => {
		const msg = reminderMessage({
			name: "Steven",
			style: "roast",
			when: "<t:1:R>",
			leagues: leagues.slice(0, 1),
			seed: "x",
		});
		expect(msg.subject).toBe("Steven, your picks are still blank");
		expect(msg.intro).toContain("1 ");
		expect(msg.games).toEqual(["BUF @ KC"]);
	});

	it("words the same day the same way", () => {
		const a = { name: "A", style: "roast" as const, when: "soon", leagues };
		expect(reminderMessage({ ...a, seed: "d:a" })).toEqual(
			reminderMessage({ ...a, seed: "d:a" }),
		);
	});
});
