import { describe, expect, it } from "vitest";
import type { FlairGame, FlairPick } from "./flair";
import { fadeWins, ordinal, profileSummary } from "./player-profile";

const game = (
	id: string,
	week: number,
	home: string,
	away: string,
	homeScore: number,
	awayScore: number,
): FlairGame => ({
	id,
	week,
	kickoff: `2026-09-${String(week * 7 + Number(id)).padStart(2, "0")}T17:00:00Z`,
	home_team: home,
	away_team: away,
	home_score: homeScore,
	away_score: awayScore,
	locked_spread: -3,
});

const games = [
	game("1", 1, "KC", "BUF", 27, 20),
	game("2", 1, "DAL", "PHI", 10, 24),
	game("3", 2, "GB", "CHI", 17, 17),
	game("4", 2, "DEN", "LV", 21, 14),
];
const weeks = {
	1: { total: 2, final: 2 },
	2: { total: 2, final: 2 },
	3: { total: 2, final: 0 },
};
const pick = (
	user_id: string,
	game_id: string,
	team: string,
	is_lock = false,
): FlairPick => ({ user_id, game_id, team, confidence: null, is_lock });
const picks = [
	// Ann: 2-0 in week 1, 1-0-1 in week 2.
	pick("ann", "1", "KC", true),
	pick("ann", "2", "PHI"),
	pick("ann", "3", "GB"),
	pick("ann", "4", "DEN", true),
	// Bo: 1-1 in week 1, 1-1 (push) in week 2.
	pick("bo", "1", "BUF", true),
	pick("bo", "2", "PHI"),
	pick("bo", "3", "CHI"),
	pick("bo", "4", "DEN"),
];
const settings = { mode: "straight" as const };

describe("profileSummary", () => {
	const ann = profileSummary(
		"ann",
		["ann", "bo", "cy"],
		picks,
		games,
		weeks,
		settings,
	);
	const bo = profileSummary(
		"bo",
		["ann", "bo", "cy"],
		picks,
		games,
		weeks,
		settings,
	);

	it("places players like the standings list", () => {
		expect([ann.place, ann.of, ann.points]).toEqual([1, 3, 3]);
		expect(bo.place).toBe(2);
	});

	it("counts the record and lock record", () => {
		expect(ann.record).toEqual({ w: 3, l: 0, p: 1 });
		expect(ann.locks).toEqual({ w: 2, l: 0, p: 0 });
		expect(bo.locks).toEqual({ w: 0, l: 1, p: 0 });
	});

	it("lists each finished week with place and a crown for the winner", () => {
		expect(ann.weeks.map((w) => [w.week, w.rank, w.of, w.won])).toEqual([
			[1, 1, 2, true],
			[2, 1, 2, true],
		]);
		expect(ann.weeksWon).toBe(2);
		expect(bo.weeks.map((w) => w.rank)).toEqual([2, 1]);
	});

	it("leaves a week they skipped unranked", () => {
		const cy = profileSummary(
			"cy",
			["ann", "bo", "cy"],
			picks,
			games,
			weeks,
			settings,
		);
		expect(cy.weeks.map((w) => w.rank)).toEqual([null, null]);
		expect(cy.weeksWon).toBe(0);
	});
});

describe("fadeWins", () => {
	const g = (id: string, crowd: number | null) => ({
		id,
		week: 1,
		home_team: "KC",
		away_team: "BUF",
		home_score: 20,
		away_score: 27,
		locked_spread: -3,
		crowd_home_pct: crowd,
	});
	it("counts wins on a side at most 20% of the crowd took", () => {
		const games = [g("1", 85), g("2", 80), g("3", 70), g("4", null)];
		const picks = ["1", "2", "3", "4"].map((id) => ({
			game_id: id,
			team: "BUF",
			confidence: null,
		}));
		expect(fadeWins(picks, games, settings)).toBe(2);
	});
	it("doesn't count a losing fade", () => {
		expect(
			fadeWins(
				[{ game_id: "1", team: "KC", confidence: null }],
				[g("1", 10)],
				settings,
			),
		).toBe(0);
	});
});

describe("ordinal", () => {
	it("handles teens and the usual endings", () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual([
			"1st",
			"2nd",
			"3rd",
			"4th",
			"11th",
			"12th",
			"13th",
			"21st",
			"22nd",
			"101st",
		]);
	});
});
