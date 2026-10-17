import { describe, expect, it } from "vitest";
import type { FlairGame, FlairPick } from "./flair";
import {
	badgeHistory,
	headToHead,
	rivalFor,
	seasonLine,
	signatureMoves,
} from "./profile-extras";

const game = (
	id: string,
	week: number,
	home: string,
	away: string,
	homeScore: number,
	awayScore: number,
	spread: number,
): FlairGame => ({
	id,
	week,
	kickoff: `2026-09-${String(week * 7 + Number(id)).padStart(2, "0")}T17:00:00Z`,
	home_team: home,
	away_team: away,
	home_score: homeScore,
	away_score: awayScore,
	locked_spread: spread,
});

const games = [
	// KC favored by 3, wins.
	game("1", 1, "KC", "BUF", 27, 20, -3),
	// DAL a 7.5-point home underdog, wins outright.
	game("2", 1, "DAL", "PHI", 24, 10, 7.5),
	// GB favored by 10, loses.
	game("3", 2, "GB", "CHI", 10, 17, -10),
	// KC on the road, favored by 2.5, wins.
	game("4", 2, "DEN", "KC", 14, 21, 2.5),
];
const weeks = { 1: { total: 2, final: 2 }, 2: { total: 2, final: 2 } };
const pick = (
	user_id: string,
	game_id: string,
	team: string,
	extra: Partial<FlairPick> = {},
): FlairPick => ({ user_id, game_id, team, confidence: null, ...extra });
const picks = [
	pick("ann", "1", "KC"),
	pick("ann", "2", "DAL"),
	pick("ann", "3", "GB", { is_lock: true }),
	pick("ann", "4", "KC"),
	pick("bo", "1", "BUF"),
	pick("bo", "2", "PHI"),
	pick("bo", "3", "CHI"),
	pick("bo", "4", "KC"),
];
const settings = { mode: "straight" as const };

describe("headToHead", () => {
	it("counts only games they split on, and weeks they both played", () => {
		const h = headToHead("ann", "bo", picks, games, weeks, settings);
		expect(h.games).toBe(3);
		expect(h.a).toEqual({ w: 2, l: 1, p: 0 });
		expect(h.b).toEqual({ w: 1, l: 2, p: 0 });
		expect(h.weeks).toEqual({ a: 1, b: 1, tied: 0 });
	});
});

describe("signatureMoves", () => {
	const s = signatureMoves("ann", picks, games, settings);
	it("finds the most-picked team", () => {
		expect(s.team).toMatchObject({ team: "KC", count: 2, w: 2, l: 0 });
	});
	it("finds the biggest underdog that won", () => {
		expect(s.boldest).toMatchObject({ week: 1, team: "DAL", line: 7.5 });
	});
	it("calls a lost lock the worst beat", () => {
		expect(s.worstBeat).toMatchObject({ team: "GB", lock: true, line: -10 });
	});
	it("uses the top confidence loss in confidence leagues", () => {
		const conf = [
			pick("cy", "1", "BUF", { confidence: 4 }),
			pick("cy", "3", "GB", { confidence: 1, is_lock: true }),
		];
		expect(
			signatureMoves("cy", conf, games, { mode: "confidence" }).worstBeat,
		).toMatchObject({ team: "BUF", confidence: 4 });
	});
});

describe("rivalFor", () => {
	const rows = [
		{ userId: "a", total: 30, correct: 0, byWeek: {} },
		{ userId: "b", total: 25, correct: 0, byWeek: {} },
		{ userId: "c", total: 24, correct: 0, byWeek: {} },
	];
	it("picks the nearer neighbor", () => {
		expect(rivalFor("b", rows)).toEqual({ userId: "c", gap: 1, ahead: true });
		expect(rivalFor("c", rows)).toEqual({ userId: "b", gap: 1, ahead: false });
	});
	it("gives the leader the runner-up", () => {
		expect(rivalFor("a", rows)).toEqual({ userId: "b", gap: 5, ahead: true });
	});
});

describe("seasonLine", () => {
	it("runs totals against the league average", () => {
		expect(
			seasonLine("ann", ["ann", "bo"], picks, games, weeks, settings),
		).toEqual([
			{ week: 1, you: 2, avg: 1 },
			{ week: 2, you: 3, avg: 2.5 },
		]);
	});
});

describe("badgeHistory", () => {
	const h = badgeHistory("ann", ["ann", "bo"], picks, games, weeks, settings);
	it("lists weeks won, upsets, locks and the best streak", () => {
		expect(h["week-winner"]).toEqual(["Week 1: 2 pts"]);
		expect(h.perfect).toEqual(["Week 1: 2 for 2"]);
		expect(h.upset).toEqual(["Week 1: DAL +7.5 beat PHI"]);
		expect(h.locks).toEqual(["Week 2: GB lost"]);
		expect(h["longest-streak"]).toEqual(["2 right in Week 1"]);
	});
});
