import { describe, expect, it } from "vitest";
import type { Game, Team } from "./nfl/types";
import { weekResults, weekWinners } from "./week-results";

const team = (abbr: string): Team => ({
	id: abbr,
	abbr,
	name: abbr,
	shortName: abbr,
	color: "#000000",
	altColor: "#ffffff",
	logo: "",
});

const game = (id: string, home: number, away: number): Game => ({
	id,
	season: 2026,
	week: 3,
	kickoff: "2026-09-21T17:00:00Z",
	state: "post",
	statusText: "Final",
	home: team("KC"),
	away: team("BUF"),
	homeScore: home,
	awayScore: away,
	spread: -3,
	spreadText: "KC -3",
});

const pick = (
	user_id: string,
	game_id: string,
	team: string,
	confidence: number | null = null,
) => ({
	user_id,
	game_id,
	team,
	confidence,
	is_lock: false,
});

describe("weekResults", () => {
	const games = [
		{ ...game("g1", 24, 20), lockedSpread: -6.5 },
		{ ...game("g2", 17, 17), lockedSpread: 0 },
	];

	it("scores each pick and ranks the week, keeping players with no picks", () => {
		const rows = weekResults(
			["a", "b", "c"],
			[pick("a", "g1", "BUF"), pick("b", "g1", "KC"), pick("b", "g2", "KC")],
			games,
			{ mode: "straight" },
		);
		expect(rows.map((r) => r.userId)).toEqual(["b", "a", "c"]);
		expect(rows[0]).toMatchObject({ points: 1, wins: 1, pushes: 1 });
		expect(rows[0].cells.g1.outcome).toBe("win");
		expect(rows[1].cells.g1.outcome).toBe("loss");
		expect(rows[2].cells).toEqual({});
	});

	it("uses the locked spread and push value against the spread", () => {
		const [row] = weekResults(
			["a"],
			[pick("a", "g1", "BUF"), pick("a", "g2", "BUF")],
			games,
			{ mode: "spread", pushValue: 0.5 },
		);
		expect(row.cells.g1.outcome).toBe("win");
		expect(row.cells.g2).toMatchObject({ outcome: "push", points: 0.5 });
		expect(row.points).toBe(1.5);
	});

	it("weights confidence picks and ignores players outside the list", () => {
		const rows = weekResults(
			["a"],
			[pick("a", "g1", "KC", 9), pick("z", "g1", "KC", 2)],
			games,
			{ mode: "confidence" },
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].points).toBe(9);
	});
});

describe("weekWinners", () => {
	const row = (userId: string, points: number) => ({
		userId,
		cells: {},
		points,
		wins: points,
		losses: 0,
		pushes: 0,
	});

	it("crowns everyone tied on top once the week is done", () => {
		const rows = [row("a", 9), row("b", 9), row("c", 4)];
		expect([...weekWinners(rows, true)]).toEqual(["a", "b"]);
		expect(weekWinners(rows, false).size).toBe(0);
		expect(weekWinners([row("a", 0)], true).size).toBe(0);
	});
});
