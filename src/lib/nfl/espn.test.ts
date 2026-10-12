import { describe, expect, it } from "vitest";
import {
	type EspnScoreboard,
	parseHomeSpread,
	parseScoreboard,
	regularSeasonStandIn,
} from "./espn";

describe("parseHomeSpread", () => {
	it("reads the favorite from details", () => {
		expect(parseHomeSpread("KC -3.5", "KC", "BUF")).toBe(-3.5);
		expect(parseHomeSpread("BUF -3.5", "KC", "BUF")).toBe(3.5);
		expect(parseHomeSpread("EVEN", "KC", "BUF")).toBe(0);
		expect(parseHomeSpread(undefined, "KC", "BUF")).toBeNull();
	});
});

describe("parseScoreboard", () => {
	it("maps an event to a game", () => {
		const data: EspnScoreboard = {
			season: { year: 2026 },
			week: { number: 6 },
			events: [
				{
					id: "401",
					date: "2026-10-11T17:00Z",
					competitions: [
						{
							status: {
								type: { state: "pre", shortDetail: "10/11 - 1:00 PM EDT" },
							},
							odds: [{ details: "BUF -2.5" }],
							competitors: [
								{
									homeAway: "home",
									score: "0",
									team: {
										id: "12",
										abbreviation: "KC",
										displayName: "Kansas City Chiefs",
										shortDisplayName: "Chiefs",
										color: "e31837",
									},
								},
								{
									homeAway: "away",
									score: "0",
									team: {
										id: "2",
										abbreviation: "BUF",
										displayName: "Buffalo Bills",
										shortDisplayName: "Bills",
										color: "00338d",
									},
								},
							],
						},
					],
				},
			],
		};
		const [g] = parseScoreboard(data);
		expect(g).toMatchObject({
			id: "401",
			week: 6,
			season: 2026,
			spread: 2.5,
			state: "pre",
		});
		expect(g.home.color).toBe("#e31837");
	});
});

describe("regular season only", () => {
	const event = (id: string, type?: number) => ({
		id,
		date: "2027-01-10T18:00Z",
		season: type ? { year: 2026, type } : undefined,
		week: { number: 1 },
		competitions: [
			{
				status: { type: { state: "pre" as const } },
				competitors: [
					{
						homeAway: "home" as const,
						team: {
							id: "1",
							abbreviation: "KC",
							displayName: "Kansas City Chiefs",
							shortDisplayName: "Chiefs",
						},
					},
					{
						homeAway: "away" as const,
						team: {
							id: "2",
							abbreviation: "BUF",
							displayName: "Buffalo Bills",
							shortDisplayName: "Bills",
						},
					},
				],
			},
		],
	});

	it("drops preseason and playoff games, which reuse weeks 1 to 5", () => {
		const games = parseScoreboard({
			season: { year: 2026, type: 3 },
			events: [event("wildcard", 3), event("pre", 1), event("reg", 2)],
		});
		expect(games.map((g) => g.id)).toEqual(["reg"]);
	});

	it("keeps events when the feed doesn't say the season type", () => {
		expect(parseScoreboard({ events: [event("x")] })).toHaveLength(1);
	});

	it("stands in week 18 during the playoffs and week 1 in the preseason", () => {
		expect(
			regularSeasonStandIn({ season: { year: 2026, type: 3 }, events: [] }),
		).toEqual({ season: 2026, week: 18 });
		expect(
			regularSeasonStandIn({ season: { year: 2027, type: 1 }, events: [] }),
		).toEqual({ season: 2027, week: 1 });
		expect(
			regularSeasonStandIn({ season: { year: 2026, type: 2 }, events: [] }),
		).toBeNull();
		expect(regularSeasonStandIn({ events: [] })).toBeNull();
	});
});
