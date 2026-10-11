import { describe, expect, it } from "vitest";
import type { Game } from "./nfl/types";
import {
	clockText,
	friendPicks,
	keyGame,
	missGame,
	PRACTICE_TOTAL,
	PRACTICE_USER,
	practiceFinals,
	practiceGames,
	RIVAL_GUESS,
	scoreAt,
} from "./practice";
import type { ScoringMode } from "./scoring";
import { type WeekPick, weekResults } from "./week-results";

const FRIENDS: [string, string, string] = ["rival", "close", "contrarian"];

function playWeek(
	mode: ScoringMode,
	choose: (g: Game, i: number) => string,
	lockIndex: number,
	guess: number,
) {
	const games = practiceGames(new Date("2026-10-14T12:00:00"));
	const mine = Object.fromEntries(
		games.map((g, i) => [
			g.id,
			{ team: choose(g, i), confidence: mode === "confidence" ? i + 1 : null },
		]),
	);
	const lock = games[lockIndex].id;
	const key = keyGame(games, mine, lock, mode);
	const miss = missGame(games, mine, key, mode);
	const finals = practiceFinals(games, mine, miss);
	const done = games.map((g) => ({
		...g,
		state: "post" as const,
		homeScore: finals[g.id].home,
		awayScore: finals[g.id].away,
		lockedSpread: g.spread,
	}));
	const picks: WeekPick[] = [
		...games.map((g) => ({
			user_id: PRACTICE_USER,
			game_id: g.id,
			team: mine[g.id].team,
			confidence: mine[g.id].confidence,
			is_lock: g.id === lock,
			tiebreaker: g.id === games[2].id ? guess : null,
		})),
		...friendPicks(games, mine, key, miss, FRIENDS),
	];
	const rows = weekResults([PRACTICE_USER, ...FRIENDS], picks, done, {
		mode,
	});
	return { games, done, rows, key, miss };
}

describe("practice week", () => {
	for (const mode of ["straight", "spread", "confidence"] as const)
		for (const side of ["home", "away"] as const)
			it(`${mode}, picking ${side} teams: key pick hits, one miss, rival ties`, () => {
				const { rows, key, miss } = playWeek(mode, (g) => g[side].abbr, 1, 44);
				const you = rows.find((r) => r.userId === PRACTICE_USER);
				const rival = rows.find((r) => r.userId === "rival");
				expect(you?.cells[key].outcome).toBe("win");
				expect(you?.cells[miss].outcome).toBe("loss");
				expect(you?.wins).toBe(2);
				expect(rival?.points).toBe(you?.points);
				for (const id of ["close", "contrarian"])
					expect(rows.find((r) => r.userId === id)?.points).toBeLessThan(
						you?.points ?? 0,
					);
				// Closer tiebreaker guess wins the week.
				expect(you?.place).toBe(1);
				expect(rival?.place).toBe(2);
			});

	it("Monday night always totals the same, so the tiebreaker is fair", () => {
		const { done } = playWeek("straight", (g) => g.away.abbr, 0, 44);
		const last = done[2];
		expect(last.homeScore + last.awayScore).toBe(PRACTICE_TOTAL);
	});

	it("a worse guess than the rival loses the tiebreaker", () => {
		const { rows } = playWeek("straight", (g) => g.home.abbr, 0, 70);
		expect(rows.find((r) => r.userId === "rival")?.place).toBe(1);
		expect(rows.find((r) => r.userId === PRACTICE_USER)?.place).toBe(2);
		expect(Math.abs(RIVAL_GUESS - PRACTICE_TOTAL)).toBeLessThan(
			70 - PRACTICE_TOTAL,
		);
	});

	it("confidence leagues key off the most confident pick, not the lock", () => {
		const { key, miss, games } = playWeek(
			"confidence",
			(g) => g.home.abbr,
			0,
			44,
		);
		expect(key).toBe(games[2].id);
		expect(miss).toBe(games[0].id);
	});

	it("kickoffs land on the coming weekend", () => {
		const games = practiceGames(new Date("2026-10-14T12:00:00"));
		expect(new Date(games[0].kickoff).getDay()).toBe(0);
		expect(new Date(games[2].kickoff).getDay()).toBe(1);
		expect(games.every((g) => g.state === "pre")).toBe(true);
	});

	it("scores climb in football-sized steps and land on the final", () => {
		expect(scoreAt(27, 0)).toBe(0);
		expect(scoreAt(27, 0.3)).toBe(7);
		expect(scoreAt(27, 1)).toBe(27);
		for (let p = 0; p < 1; p += 0.05)
			expect(scoreAt(19, p)).toBeLessThanOrEqual(19);
	});

	it("game clock reads like a broadcast", () => {
		expect(clockText(0)).toBe("1st 15:00");
		expect(clockText(0.51)).toBe("Halftime");
		expect(clockText(0.9)).toMatch(/^4th /);
		expect(clockText(1)).toBe("Final");
	});
});
