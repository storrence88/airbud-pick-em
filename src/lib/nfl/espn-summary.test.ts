import { describe, expect, it } from "vitest";
import { type EspnSummary, parseSummary } from "./espn-summary";

const teams = {
	home: { id: "9", abbr: "GB" },
	away: { id: "3", abbr: "CHI" },
	season: 2026,
};

const summary: EspnSummary = {
	injuries: [
		{
			team: { id: "9", abbreviation: "GB" },
			injuries: [
				{
					status: "Injured Reserve",
					athlete: {
						displayName: "Marlon Jones",
						position: { abbreviation: "CB" },
					},
					details: { type: "Undisclosed" },
				},
				{
					status: "Questionable",
					athlete: {
						displayName: "Josh Jacobs",
						position: { abbreviation: "RB" },
					},
					details: { type: "Groin" },
				},
				{
					status: "Out",
					athlete: {
						displayName: "Tucker Kraft",
						position: { abbreviation: "TE" },
					},
					details: { type: "Knee - ACL" },
				},
			],
		},
		{
			team: { id: "3" },
			injuries: [
				{
					status: "Questionable",
					athlete: {
						displayName: "Tyson Bagent",
						position: { abbreviation: "QB" },
					},
					details: { type: "Hamstring" },
				},
			],
		},
	],
	gameInfo: {
		venue: {
			fullName: "Lambeau Field",
			address: { city: "Green Bay", state: "WI" },
		},
		weather: {
			conditionId: "3",
			displayValue: "Partly sunny",
			temperature: 52,
			gust: 12,
		},
	},
	pickcenter: [
		{
			provider: { name: "DraftKings" },
			spread: -3.5,
			overUnder: 47.5,
			pointSpread: { home: { open: { line: "-3" }, close: { line: "-3.5" } } },
			total: { over: { open: { line: "o49.5" }, close: { line: "o47.5" } } },
		},
	],
	lastFiveGames: [
		{
			team: { id: "9", abbreviation: "GB" },
			events: [
				{
					gameDate: "2026-01-04T18:00Z",
					gameResult: "L",
					score: "16-3",
					atVs: "@",
					opponent: { abbreviation: "MIN" },
				},
				{
					gameDate: "2026-09-13T17:00Z",
					gameResult: "W",
					score: "27-20",
					atVs: "vs",
					opponent: { abbreviation: "DET" },
				},
				{
					gameDate: "2026-09-20T17:00Z",
					gameResult: "L",
					score: "24-17",
					atVs: "@",
					opponent: { abbreviation: "LAR" },
				},
			],
		},
	],
};

describe("parseSummary", () => {
	const d = parseSummary(summary, teams);

	it("sorts injuries by severity and drops vague details", () => {
		expect(d.injuries.home.map((i) => i.status)).toEqual([
			"Out",
			"Questionable",
			"Injured Reserve",
		]);
		expect(d.injuries.home[2].detail).toBeNull();
		expect(d.injuries.home[0].detail).toBe("Knee - ACL");
	});

	it("matches teams by id when the abbreviation is missing", () => {
		expect(d.injuries.away).toEqual([
			{
				name: "Tyson Bagent",
				position: "QB",
				status: "Questionable",
				detail: "Hamstring",
			},
		]);
	});

	it("reads the home line at open and now, and the total", () => {
		expect(d.line).toEqual({
			open: -3,
			current: -3.5,
			totalOpen: 49.5,
			totalCurrent: 47.5,
			provider: "DraftKings",
		});
	});

	it("reads venue and weather", () => {
		expect(d.venue).toEqual({ name: "Lambeau Field", place: "Green Bay, WI" });
		expect(d.weather).toEqual({
			temp: 52,
			condition: "Partly sunny",
			precip: null,
			wind: 12,
		});
	});

	it("keeps only this season's recent games", () => {
		expect(d.form.home).toEqual([
			{ result: "W", opponent: "vs DET", score: "27-20" },
			{ result: "L", opponent: "@ LAR", score: "24-17" },
		]);
		expect(d.form.away).toEqual([]);
	});

	it("treats a worded conditionId as the condition", () => {
		const s = parseSummary(
			{
				gameInfo: { weather: { conditionId: "Mostly clear", temperature: 81 } },
			},
			teams,
		);
		expect(s.weather?.condition).toBe("Mostly clear");
		const n = parseSummary(
			{ gameInfo: { weather: { conditionId: "3" } } },
			teams,
		);
		expect(n.weather).toBeNull();
	});

	it("returns empty sections when ESPN has nothing", () => {
		expect(parseSummary({}, teams)).toEqual({
			injuries: { home: [], away: [] },
			venue: null,
			weather: null,
			line: null,
			form: { home: [], away: [] },
		});
	});
});
