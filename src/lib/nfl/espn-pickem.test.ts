import { describe, expect, it } from "vitest";
import { type PickemChallenge, parsePublicPicks } from "./espn-pickem";
import type { Game, Team } from "./types";

const team = (abbr: string): Team => ({
	id: abbr,
	abbr,
	name: abbr,
	shortName: abbr,
	color: "#000",
	altColor: "#fff",
	logo: "",
});

const game = (id: string, away: string, home: string): Game => ({
	id,
	season: 2026,
	week: 6,
	kickoff: "2026-10-11T17:00Z",
	state: "pre",
	statusText: "",
	home: team(home),
	away: team(away),
	homeScore: 0,
	awayScore: 0,
	spread: null,
	spreadText: null,
});

describe("parsePublicPicks", () => {
	const games = [game("401", "TB", "DAL"), game("402", "BUF", "KC")];

	it("matches by event id and normalizes counts", () => {
		const data: PickemChallenge = {
			propositions: [
				{
					mappings: [{ type: "COMPETITION_ID", value: "401" }],
					possibleOutcomes: [
						{ abbrev: "TB", choiceCounters: [{ count: 20 }] },
						{ abbrev: "DAL", choiceCounters: [{ count: 980 }] },
					],
				},
			],
		};
		expect(parsePublicPicks(data, games).get("401")).toEqual({
			home: 98,
			away: 2,
		});
	});

	it("falls back to team abbreviations and percentages", () => {
		const data: PickemChallenge = {
			propositions: [
				{
					possibleOutcomes: [
						{ abbrev: "kc", choiceCounters: [{ percentage: 0.555 }] },
						{ abbrev: "buf", choiceCounters: [{ percentage: 0.445 }] },
					],
				},
			],
		};
		expect(parsePublicPicks(data, games).get("402")).toEqual({
			home: 56,
			away: 44,
		});
	});

	it("skips games it can't match or has no picks for", () => {
		const data: PickemChallenge = {
			propositions: [
				{ possibleOutcomes: [{ abbrev: "NYJ" }, { abbrev: "NE" }] },
				{
					possibleOutcomes: [
						{ abbrev: "TB", choiceCounters: [{ count: 0 }] },
						{ abbrev: "DAL", choiceCounters: [{ count: 0 }] },
					],
				},
			],
		};
		expect(parsePublicPicks(data, games).size).toBe(0);
		expect(parsePublicPicks({}, games).size).toBe(0);
	});
});
