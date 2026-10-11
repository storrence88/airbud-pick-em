import { describe, expect, it } from "vitest";
import { rankWeek, type WeekGame, weekWinners } from "./weekly";

let n = 0;
/** A final where the home team wins 24-20. */
function game(week: number): WeekGame {
	n += 1;
	return {
		id: `g${n}`,
		week,
		kickoff: `2026-09-${String(n).padStart(2, "0")}T17:00:00Z`,
		home_team: "KC",
		away_team: "BUF",
		home_score: 24,
		away_score: 20,
		locked_spread: -3.5,
	};
}

const pick = (user: string, g: WeekGame, team: string) => ({
	user_id: user,
	game_id: g.id,
	team,
	confidence: null,
});

const straight = { mode: "straight" as const };

describe("rankWeek", () => {
	const w1 = [game(1), game(1), game(1)];
	const w2 = [game(2)];
	const games = [...w1, ...w2];

	it("ranks one week, sharing ranks on ties and leaving non-pickers unranked", () => {
		const picks = [
			pick("a", w1[0], "KC"),
			pick("a", w1[1], "KC"),
			pick("b", w1[0], "KC"),
			pick("b", w1[1], "KC"),
			pick("c", w1[0], "BUF"),
			pick("d", w2[0], "KC"),
		];
		const rows = rankWeek(["a", "b", "c", "d"], picks, games, 1, straight);
		expect(rows.map((r) => [r.userId, r.points, r.rank])).toEqual([
			["a", 2, 1],
			["b", 2, 1],
			["c", 0, 3],
			["d", 0, null],
		]);
		expect(weekWinners(rows).map((r) => r.userId)).toEqual(["a", "b"]);
	});

	it("gives a tie on points to the closer tiebreaker guess", () => {
		// The last game ends 24-20, a 44-point total.
		const picks = [
			pick("a", w1[0], "KC"),
			{ ...pick("a", w1[2], "BUF"), tiebreaker: 50 },
			pick("b", w1[0], "KC"),
			{ ...pick("b", w1[2], "BUF"), tiebreaker: 41 },
		];
		const rows = rankWeek(["a", "b"], picks, games, 1, straight);
		expect(rows.map((r) => [r.userId, r.rank, r.miss])).toEqual([
			["b", 1, 3],
			["a", 2, 6],
		]);
		expect(rows[0].tiebroken).toBe(true);
		expect(weekWinners(rows).map((r) => r.userId)).toEqual(["b"]);
	});

	it("crowns nobody when nobody scored", () => {
		const rows = rankWeek(["a"], [pick("a", w2[0], "BUF")], games, 2, straight);
		expect(rows[0].rank).toBe(1);
		expect(weekWinners(rows)).toEqual([]);
	});
});
