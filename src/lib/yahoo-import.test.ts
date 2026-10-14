import { describe, expect, it } from "vitest";
import {
	guessMember,
	type ImportGame,
	matchupCheck,
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

describe("parseWeekPaste with Yahoo's group picks table", () => {
	// Week 1, 2026, as Yahoo shows it (favorite first in each game).
	const week1: ImportGame[] = [
		["SEA", "NE"],
		["LAR", "SF"],
		["CIN", "TB"],
		["DET", "NO"],
		["TEN", "NYJ"],
		["BAL", "IND"],
		["PIT", "ATL"],
		["CHI", "CAR"],
		["JAX", "CLE"],
		["BUF", "HOU"],
		["LV", "MIA"],
		["MIN", "GB"],
		["PHI", "WSH"],
		["LAC", "ARI"],
		["DAL", "NYG"],
		["KC", "DEN"],
	].map(([home, away], i) => ({
		id: String(i + 1),
		home,
		away,
		kickoff: `2026-09-13T${String(10 + i).padStart(2, "0")}:00:00Z`,
	}));
	const players: [string, string, number][] = [
		[
			"JockGPT",
			"Sea (10) LAR (9) Cin (11) Det (14) Ten (3) Bal (12) Pit (8) Chi (7) Jax (15) Hou (1) LV (6) GB (2) Phi (13) LAC (16) Dal (5) Den (4)",
			96,
		],
		[
			"100% All Picks Correct [REAL]",
			"Sea (9) LAR (10) TB (6) Det (14) Ten (5) Bal (8) Pit (13) Chi (11) Jax (12) Buf (1) LV (7) GB (3) Phi (15) LAC (16) Dal (2) KC (4)",
			94,
		],
	];
	const header = [
		"Favored\tSea\tLAR\tCin\tDet\tTen\tBal\tPit\tChi\tJax\tBuf\tLV\tMin\tPhi\tLAC\tDal\tKC\t",
		"Spread\t3.5\t3.5\t3.5\t7.0\t1.5\t3.5\t3.5\t2.5\t8.5\t1.5\t3.5\t1.5\t5.0\t10.0\t2.5\t3.0\t",
		"Underdog\tNE\tSF\tTB\tNO\tNYJ\tInd\tAtl\tCar\tCle\tHou\tMia\tGB\tWas\tAri\tNYG\tDen\t",
		"Team Name\tPoints",
	];
	const expectRows = (rows: ReturnType<typeof parseWeekPaste>) => {
		expect(rows.map((r) => r.name)).toEqual(players.map(([n]) => n));
		for (const r of rows) {
			expect(r.picks).toHaveLength(16);
			expect(r.problems).toEqual([]);
		}
		expect(rows[0].picks[9]).toEqual({
			gameId: "10",
			team: "HOU",
			confidence: 1,
		});
		expect(rows[1].picks[12]).toEqual({
			gameId: "13",
			team: "PHI",
			confidence: 15,
		});
	};

	it("reads rows copied one per line", () => {
		const text = [
			...header,
			...players.map(
				([n, p, pts]) => `${n}\t${p.replace(/\) /g, ")\t")}\t${pts}`,
			),
			"Get 'Em Picked\t\t\t\t0",
		].join("\n");
		expectRows(parseWeekPaste(text, week1, "confidence"));
	});

	it("reads cells that break between the team and its points", () => {
		const text = [
			...header,
			...players.map(
				([n, p, pts]) =>
					`${n}\t${p.replace(/ \(/g, "\n(").replace(/\) /g, ")\t")}\t${pts}`,
			),
		].join("\n");
		expectRows(parseWeekPaste(text, week1, "confidence"));
	});

	it("reads every cell on its own line", () => {
		const text = [
			...header.flatMap((l) => l.split("\t")),
			...players.flatMap(([n, p, pts]) => [
				n,
				...p.replace(/ \(/g, "\n(").replace(/\) /g, ")\n").split("\n"),
				String(pts),
			]),
		].join("\n");
		expectRows(parseWeekPaste(text, week1, "confidence"));
	});
});

describe("a table from a different week", () => {
	// Another week's table: KC and BUF are both picked, but they play each other here.
	const text = [
		"Favored\tKC\tDAL\t",
		"Underdog\tSF\tNE\t",
		"Team Name\tPoints",
		"Nate\tKC",
		"(2)    BUF",
		"(1)\t3",
	].join("\n");

	it("shows the row with a problem instead of finding nothing", () => {
		const rows = parseWeekPaste(text, games, "confidence");
		expect(rows).toHaveLength(1);
		expect(rows[0].name).toBe("Nate");
		expect(rows[0].problems[0]).toBe(
			"Has both KC and BUF, who play each other this week. Is this the right week?",
		);
	});

	it("notices the matchups don't match the week", () => {
		expect(matchupCheck(text, games)).toEqual({ listed: 2, unmatched: 2 });
		const right = "Favored\tKC\tDAL\nUnderdog\tBUF\tWas";
		expect(matchupCheck(right, games)).toEqual({ listed: 2, unmatched: 0 });
		expect(matchupCheck("Steven: KC 4", games)).toBeNull();
	});
});
