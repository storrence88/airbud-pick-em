import { describe, expect, it } from "vitest";
import type { FinishedGame } from "./standings";
import { rankWeek, weekWinners } from "./weekly";

let n = 0;
/** A final where the home team wins 24-20. */
function game(week: number): FinishedGame {
	n += 1;
	return {
		id: `g${n}`,
		week,
		home_team: "KC",
		away_team: "BUF",
		home_score: 24,
		away_score: 20,
		locked_spread: -3.5,
	};
}

const pick = (user: string, g: FinishedGame, team: string) => ({
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

	it("lets a tiebreak split first place", () => {
		const picks = [pick("a", w1[0], "KC"), pick("b", w1[0], "KC")];
		const rows = rankWeek(["a", "b"], picks, games, 1, straight, {
			tiebreak: (x, y) => (x.userId === "b" ? -1 : y.userId === "b" ? 1 : 0),
		});
		expect(rows.map((r) => [r.userId, r.rank])).toEqual([
			["b", 1],
			["a", 2],
		]);
		expect(weekWinners(rows).map((r) => r.userId)).toEqual(["b"]);
	});

	it("crowns nobody when nobody scored", () => {
		const rows = rankWeek(["a"], [pick("a", w2[0], "BUF")], games, 2, straight);
		expect(rows[0].rank).toBe(1);
		expect(weekWinners(rows)).toEqual([]);
	});
});
