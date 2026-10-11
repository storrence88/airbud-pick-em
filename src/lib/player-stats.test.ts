import { describe, expect, it } from "vitest";
import {
	computePlayerStats,
	formatRecord,
	type StatsGame,
} from "./player-stats";

const game = (
	id: string,
	week: number,
	home: string,
	away: string,
	homeScore: number,
	awayScore: number,
	spread: number | null,
	crowd: number | null = null,
): StatsGame => ({
	id,
	week,
	home_team: home,
	away_team: away,
	home_score: homeScore,
	away_score: awayScore,
	locked_spread: spread,
	crowd_home_pct: crowd,
});

const games = [
	// KC favored by 3 at home, wins by 7; crowd on KC.
	game("1", 1, "KC", "BUF", 27, 20, -3, 70),
	// DAL underdog at home, loses; crowd on PHI.
	game("2", 1, "DAL", "PHI", 10, 24, 6.5, 20),
	// Pick'em that ends tied: a push, no favorite.
	game("3", 2, "GB", "CHI", 17, 17, 0, 55),
	// KC on the road as an underdog, wins; crowd on DEN, no snapshot elsewhere.
	game("4", 2, "DEN", "KC", 14, 21, -2.5, 60),
	// Week 3 isn't finished, but this game is: it counts everywhere but best/worst week.
	game("5", 3, "SF", "SEA", 30, 3, -4, null),
];
const weeks = {
	1: { total: 2, final: 2 },
	2: { total: 2, final: 2 },
	3: { total: 2, final: 1 },
};
const picks = [
	{ game_id: "1", team: "KC", confidence: 4 },
	{ game_id: "2", team: "DAL", confidence: 1 },
	{ game_id: "3", team: "GB", confidence: 2 },
	{ game_id: "4", team: "KC", confidence: 3 },
	{ game_id: "5", team: "SF", confidence: 5 },
];

describe("computePlayerStats", () => {
	const s = computePlayerStats(picks, games, weeks, { mode: "straight" });

	it("counts the overall record with ties as pushes", () => {
		expect(formatRecord(s.overall)).toBe("3-1-1");
	});

	it("splits by team picked, most-picked first", () => {
		expect(s.byTeam[0]).toEqual({ team: "KC", w: 2, l: 0, p: 0 });
		expect(s.byTeam.map((t) => t.team)).toContain("DAL");
	});

	it("splits home and away", () => {
		expect(s.home).toEqual({ w: 2, l: 1, p: 1 });
		expect(s.away).toEqual({ w: 1, l: 0, p: 0 });
	});

	it("splits favorite and underdog from the locked line, skipping pick'ems", () => {
		expect(s.favorite).toEqual({ w: 2, l: 0, p: 0 });
		expect(s.underdog).toEqual({ w: 1, l: 1, p: 0 });
	});

	it("finds best and worst among finished weeks only", () => {
		expect(s.weeks.map((w) => w.week)).toEqual([1, 2]);
		expect(s.best?.week).toBe(1);
		// Week 2 and week 1 both score 1 straight up; the first wins ties.
		expect(s.worst?.points).toBe(1);
	});

	it("uses confidence points for best and worst week", () => {
		const c = computePlayerStats(picks, games, weeks, { mode: "confidence" });
		expect(c.best).toMatchObject({ week: 1, points: 4 });
		expect(c.worst).toMatchObject({ week: 2, points: 3 });
	});

	it("compares against the ESPN crowd on games with a snapshot", () => {
		expect(s.crowd.games).toBe(4);
		expect(s.crowd.you).toEqual({ w: 2, l: 1, p: 1 });
		// Crowd: KC win, PHI win, GB push, DEN loss.
		expect(s.crowd.crowd).toEqual({ w: 2, l: 1, p: 1 });
		// Against the crowd: DAL (loss) and KC at DEN (win).
		expect(s.crowd.against).toEqual({ w: 1, l: 1, p: 0 });
	});

	it("scores against the spread in spread leagues", () => {
		const ats = computePlayerStats(picks, games, weeks, { mode: "spread" });
		// KC -3 wins by 7 covers; DAL +6.5 loses by 14; GB push; KC +2.5 covers.
		expect(formatRecord(ats.overall)).toBe("3-1-1");
		expect(ats.favorite).toEqual({ w: 2, l: 0, p: 0 });
	});

	it("hides worst week until two weeks are done", () => {
		const one = computePlayerStats(picks.slice(0, 2), games, weeks, {
			mode: "straight",
		});
		expect(one.best?.week).toBe(1);
		expect(one.worst).toBeNull();
	});
});
