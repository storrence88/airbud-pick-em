import { describe, expect, it } from "vitest";
import {
	rankWeek,
	tiebreakerGameId,
	tiebreakerMisses,
	weekWinners,
} from "./tiebreaker";

describe("tiebreakerGameId", () => {
	it("picks the latest kickoff, then the higher id", () => {
		expect(
			tiebreakerGameId([
				{ id: "a", kickoff: "2026-10-11T17:00:00Z" },
				{ id: "c", kickoff: "2026-10-13T00:15:00Z" },
				{ id: "b", kickoff: "2026-10-13T00:15:00Z" },
			]),
		).toBe("c");
		expect(tiebreakerGameId([])).toBeNull();
	});
});

describe("rankWeek", () => {
	it("breaks a points tie with the closest guess, over or under", () => {
		const ranked = rankWeek([
			{ userId: "a", points: 10, miss: 6 },
			{ userId: "b", points: 10, miss: 2 },
			{ userId: "c", points: 12, miss: null },
			{ userId: "d", points: 10, miss: null },
		]);
		expect(ranked.map((r) => [r.userId, r.place])).toEqual([
			["c", 1],
			["b", 2],
			["a", 3],
			["d", 4],
		]);
		expect(ranked.find((r) => r.userId === "b")?.tiebroken).toBe(true);
		expect(ranked.find((r) => r.userId === "c")?.tiebroken).toBe(false);
	});

	it("keeps a tie when the guesses miss by the same amount", () => {
		const entries = [
			{ userId: "a", points: 9, miss: 3 },
			{ userId: "b", points: 9, miss: 3 },
			{ userId: "c", points: 7, miss: 0 },
		];
		expect(weekWinners(entries)).toEqual(["a", "b"]);
		expect(rankWeek(entries).map((r) => r.place)).toEqual([1, 1, 3]);
	});

	it("has no winner when nobody scored", () => {
		expect(
			weekWinners([
				{ userId: "a", points: 0, miss: 1 },
				{ userId: "b", points: 0, miss: 5 },
			]),
		).toEqual([]);
	});
});

describe("tiebreakerMisses", () => {
	it("measures each guess against that game's total", () => {
		const games = [
			{
				id: "sun",
				kickoff: "2026-10-11T17:00:00Z",
				home_score: 10,
				away_score: 3,
			},
			{
				id: "mon",
				kickoff: "2026-10-13T00:15:00Z",
				home_score: 24,
				away_score: 20,
			},
		];
		const misses = tiebreakerMisses(
			[
				{ user_id: "a", game_id: "mon", tiebreaker: 40 },
				{ user_id: "b", game_id: "mon", tiebreaker: 51 },
				{ user_id: "c", game_id: "mon", tiebreaker: null },
				// An old guess on an earlier game loses to the one on the last game.
				{ user_id: "a", game_id: "sun", tiebreaker: 13 },
			],
			games,
		);
		expect(Object.fromEntries(misses)).toEqual({ a: 4, b: 7 });
	});
});
