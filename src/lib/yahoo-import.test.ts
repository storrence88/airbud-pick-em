import { describe, expect, it } from "vitest";
import {
	guessMember,
	type ImportGame,
	parseWeekPaste,
	teamFromWord,
} from "./yahoo-import";

const games: ImportGame[] = [
	{ id: "1", away: "BUF", home: "KC", kickoff: "2026-09-13T17:00:00Z" },
	{ id: "2", away: "WSH", home: "DAL", kickoff: "2026-09-13T20:25:00Z" },
	{ id: "3", away: "SF", home: "LAR", kickoff: "2026-09-14T00:20:00Z" },
	{ id: "4", away: "NYJ", home: "NE", kickoff: "2026-09-15T00:15:00Z" },
];

describe("teamFromWord", () => {
	it("reads ESPN, Yahoo and nickname spellings", () => {
		expect(teamFromWord("kc")).toBe("KC");
		expect(teamFromWord("Was")).toBe("WSH");
		expect(teamFromWord("Jac")).toBe("JAX");
		expect(teamFromWord("Chiefs")).toBe("KC");
		expect(teamFromWord("49ers")).toBe("SF");
		expect(teamFromWord("Steven")).toBeUndefined();
	});
});

describe("parseWeekPaste", () => {
	it("reads one player per line with points and a tiebreaker", () => {
		const rows = parseWeekPaste(
			"Steven: KC 4, Was 1, 49ers 3, NE 2, tiebreaker 41\nNate: Bills 2 DAL 3 LAR 1 NYJ 4",
			games,
			"confidence",
		);
		expect(rows).toEqual([
			{
				name: "Steven",
				picks: [
					{ gameId: "1", team: "KC", confidence: 4 },
					{ gameId: "2", team: "WSH", confidence: 1 },
					{ gameId: "3", team: "SF", confidence: 3 },
					{ gameId: "4", team: "NE", confidence: 2 },
				],
				tiebreaker: 41,
				problems: [],
			},
			{
				name: "Nate",
				picks: [
					{ gameId: "1", team: "BUF", confidence: 2 },
					{ gameId: "2", team: "DAL", confidence: 3 },
					{ gameId: "3", team: "LAR", confidence: 1 },
					{ gameId: "4", team: "NYJ", confidence: 4 },
				],
				tiebreaker: null,
				problems: [],
			},
		]);
	});

	it("reads a copied table: tab cells, points in parentheses, header and totals skipped", () => {
		const text = [
			"Player\tBuf @ KC\tWas @ Dal\tSF @ LAR\tNYJ @ NE\tPts",
			"Big Steve\tKC (4)\tDal (2)\tSF (3)\tNE (1)\t8",
			"",
		].join("\n");
		const rows = parseWeekPaste(text, games, "confidence");
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe("Big Steve");
		expect(rows[0].picks.map((p) => [p.team, p.confidence])).toEqual([
			["KC", 4],
			["DAL", 2],
			["SF", 3],
			["NE", 1],
		]);
		expect(rows[0].problems).toEqual([]);
	});

	it("reads points written before each team", () => {
		const [row] = parseWeekPaste("Nate: 4 KC 3 DAL 2 SF", games, "confidence");
		expect(row.picks.map((p) => [p.team, p.confidence])).toEqual([
			["KC", 4],
			["DAL", 3],
			["SF", 2],
		]);
	});

	it("finds the name without a separator", () => {
		const [row] = parseWeekPaste("Steven T KC 4 DAL 3", games, "confidence");
		expect(row.name).toBe("Steven T");
		expect(row.picks).toHaveLength(2);
	});

	it("flags missing, out of range and repeated points", () => {
		const [row] = parseWeekPaste(
			"Steven: KC, DAL 9, SF 2, NE 2",
			games,
			"confidence",
		);
		expect(row.problems).toEqual([
			"KC has no points.",
			"DAL has 9 points; this week goes 1 to 4.",
			"2 points is on both SF and NE.",
		]);
	});

	it("drops points outside confidence leagues", () => {
		const [row] = parseWeekPaste("Steven: KC DAL 3", games, "straight");
		expect(row.picks.map((p) => p.confidence)).toEqual([null, null]);
		expect(row.problems).toEqual([]);
	});

	it("keeps the tiebreaker only with a Monday night pick", () => {
		const [row] = parseWeekPaste("Steven: KC 4 MNF 40", games, "confidence");
		expect(row.tiebreaker).toBeNull();
	});
});

describe("guessMember", () => {
	const members = [
		{ user_id: "a", display_name: "Steven" },
		{ user_id: "b", display_name: "Nate T." },
		{ user_id: "c", display_name: "Nathan" },
	];
	it("matches names ignoring case and punctuation, then unique prefixes", () => {
		expect(guessMember("steven", members)).toBe("a");
		expect(guessMember("Nate T", members)).toBe("b");
		expect(guessMember("Stevenator", members)).toBe("a");
		expect(guessMember("Nat", members)).toBeNull();
		expect(guessMember("Zed", members)).toBeNull();
	});
});
