import { describe, expect, it } from "vitest";
import { computeFlair, type FlairGame } from "./flair";

let n = 0;
/** A final where the home team wins 24-20 unless scores are given. */
function game(week: number, opts: Partial<FlairGame> = {}): FlairGame {
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
		...opts,
	};
}

const pick = (user: string, g: FlairGame, team: string, is_lock = false) => ({
	user_id: user,
	game_id: g.id,
	team,
	confidence: null,
	is_lock,
});

const straight = { mode: "straight" as const };

describe("computeFlair", () => {
	it("counts the current and longest streak, skipping pushes", () => {
		const gs = [
			game(1),
			game(1),
			game(1),
			game(1, { home_score: 20 }),
			game(1),
		];
		const picks = [
			pick("a", gs[0], "KC"),
			pick("a", gs[1], "BUF"),
			pick("a", gs[2], "KC"),
			pick("a", gs[3], "KC"),
			pick("a", gs[4], "KC"),
		];
		const f = computeFlair(
			["a"],
			picks,
			gs,
			{ 1: { total: 5, final: 5 } },
			straight,
		);
		expect(f.a.streak).toBe(2);
		expect(f.a.longestStreak).toBe(2);
	});

	it("awards week winners, perfect weeks and last place for finished weeks only", () => {
		const w1 = [game(1), game(1)];
		const w2 = [game(2), game(2)];
		const picks = [
			...w1.map((g) => pick("a", g, "KC")),
			pick("b", w1[0], "KC"),
			pick("b", w1[1], "BUF"),
			pick("c", w1[0], "BUF"),
			pick("c", w1[1], "BUF"),
			pick("a", w2[0], "BUF"),
		];
		const weeks = { 1: { total: 2, final: 2 }, 2: { total: 3, final: 2 } };
		const f = computeFlair(
			["a", "b", "c"],
			picks,
			[...w1, ...w2],
			weeks,
			straight,
		);
		expect(f.a.badges.map((b) => b.id)).toEqual(["week-winner", "perfect"]);
		expect(f.b.badges).toEqual([]);
		expect(f.c.lastPlace).toBe(true);
		expect(f.a.lastPlace).toBe(false);
	});

	it("gives no last place when everyone ties", () => {
		const g = game(1);
		const f = computeFlair(
			["a", "b"],
			[pick("a", g, "KC"), pick("b", g, "KC")],
			[g],
			{ 1: { total: 1, final: 1 } },
			straight,
		);
		expect(f.a.lastPlace || f.b.lastPlace).toBe(false);
	});

	it("credits big-underdog wins and tracks the lock record", () => {
		const upset = game(1, {
			locked_spread: -7,
			home_score: 10,
			away_score: 17,
		});
		const lockLoss = game(1);
		const f = computeFlair(
			["a"],
			[pick("a", upset, "BUF", true), pick("a", lockLoss, "BUF")],
			[upset, lockLoss],
			{ 1: { total: 2, final: 2 } },
			straight,
		);
		const ids = Object.fromEntries(f.a.badges.map((b) => [b.id, b]));
		expect(ids.upset).toBeDefined();
		expect(ids.locks.label).toBe("1-0");
	});

	it("doesn't count a late joiner's empty weeks as their worst", () => {
		const w1 = [game(1)];
		const w2 = [game(2)];
		const picks = [
			pick("a", w1[0], "KC"),
			pick("a", w2[0], "BUF"),
			pick("b", w2[0], "KC"),
		];
		const weeks = { 1: { total: 1, final: 1 }, 2: { total: 1, final: 1 } };
		const f = computeFlair(["a", "b"], picks, [...w1, ...w2], weeks, straight);
		expect(f.a.badges.map((b) => b.id)).toContain("worst-week");
		expect(f.b.badges.map((b) => b.id)).not.toContain("worst-week");
	});

	it("gives a tied week to the closer Monday night tiebreaker guess", () => {
		const w1 = [game(1), game(1)]; // last game ends 24-20, 44 total
		const picks = [
			pick("a", w1[0], "KC"),
			{ ...pick("a", w1[1], "BUF"), tiebreaker: 50 },
			pick("b", w1[0], "KC"),
			{ ...pick("b", w1[1], "BUF"), tiebreaker: 41 },
		];
		const f = computeFlair(
			["a", "b"],
			picks,
			w1,
			{ 1: { total: 2, final: 2 } },
			straight,
		);
		expect(f.b.badges.map((b) => b.id)).toContain("week-winner");
		expect(f.a.badges.map((b) => b.id)).not.toContain("week-winner");
	});
});
