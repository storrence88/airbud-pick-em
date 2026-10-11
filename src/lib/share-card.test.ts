import { describe, expect, it } from "vitest";
import type { Game, Team } from "./nfl/types";
import { ordinal, shareCard, shareText } from "./share-card";
import { weekResults } from "./week-results";

const team = (abbr: string): Team => ({
	id: abbr,
	abbr,
	name: abbr,
	shortName: abbr,
	color: "#000000",
	altColor: "#ffffff",
	logo: "",
});

const game = (
	id: string,
	home: number,
	away: number,
	state: Game["state"] = "post",
): Game & { lockedSpread: number | null } => ({
	id,
	season: 2026,
	week: 6,
	kickoff: `2026-10-11T17:0${id.slice(1)}:00Z`,
	state,
	statusText: "Final",
	home: team("KC"),
	away: team("BUF"),
	homeScore: home,
	awayScore: away,
	spread: -3,
	spreadText: "KC -3",
	lockedSpread: -3,
});

const pick = (
	user_id: string,
	game_id: string,
	team: string,
	extra: { confidence?: number; is_lock?: boolean } = {},
) => ({
	user_id,
	game_id,
	team,
	confidence: extra.confidence ?? null,
	is_lock: extra.is_lock ?? false,
});

const games = [game("g1", 24, 20), game("g2", 17, 17), game("g3", 10, 31)];

function card(
	picks: ReturnType<typeof pick>[],
	opts: { games?: typeof games; mode?: "straight" | "confidence" } = {},
) {
	const gs = opts.games ?? games;
	const mode = opts.mode ?? "straight";
	return shareCard({
		userId: "me",
		rows: weekResults(["me", "a", "b"], picks, gs, { mode }),
		games: gs,
		week: 6,
		league: "Sunday Crew",
		mode,
	});
}

describe("shareCard", () => {
	it("sums the record, the lock and the place", () => {
		const c = card([
			pick("me", "g1", "KC", { is_lock: true }),
			pick("me", "g2", "KC"),
			pick("me", "g3", "KC"),
			pick("a", "g1", "KC"),
			pick("a", "g3", "BUF"),
		]);
		expect(c).toMatchObject({
			record: "1-1-1",
			points: null,
			lock: { team: "KC", hit: true },
			place: "2nd of 2",
			winner: false,
			missed: 0,
		});
		expect(c?.picks.map((p) => p.outcome)).toEqual(["win", "push", "loss"]);
	});

	it("waits for every game to be final", () => {
		const live = [games[0], games[1], game("g3", 0, 0, "in")];
		expect(card([pick("me", "g1", "KC")], { games: live })).toBeNull();
	});

	it("needs at least one pick", () => {
		expect(card([pick("a", "g1", "KC")])).toBeNull();
	});

	it("marks missed games and skips the place when only you played", () => {
		const c = card([pick("me", "g1", "KC"), pick("me", "g3", "BUF")]);
		expect(c).toMatchObject({ record: "2-0", missed: 1, place: null });
		expect(c?.picks[1]).toMatchObject({ outcome: "missed", team: "" });
		expect(c?.lock).toBeNull();
	});

	it("names the winner and co-winners", () => {
		expect(card([pick("me", "g1", "KC"), pick("a", "g1", "BUF")])?.place).toBe(
			"Won the week",
		);
		expect(card([pick("me", "g1", "KC"), pick("a", "g1", "KC")])?.place).toBe(
			"Co-winner",
		);
	});

	it("shows points in confidence leagues", () => {
		const c = card(
			[
				pick("me", "g1", "KC", { confidence: 3 }),
				pick("me", "g3", "BUF", { confidence: 2, is_lock: true }),
			],
			{ mode: "confidence" },
		);
		expect(c).toMatchObject({ points: 5, record: "2-0" });
		expect(shareText(c as NonNullable<typeof c>)).toBe(
			"Week 6: 2-0, 5 pts, Lock hit.",
		);
	});
});

describe("shareText", () => {
	it("reads like a group chat message", () => {
		const c = card([
			pick("me", "g1", "BUF", { is_lock: true }),
			pick("me", "g3", "BUF"),
			pick("a", "g1", "KC"),
		]);
		expect(shareText(c as NonNullable<typeof c>)).toBe(
			"Week 6: 1-1, Lock missed. Co-winner in Sunday Crew.",
		);
	});
});

describe("ordinal", () => {
	it.each([
		[1, "1st"],
		[2, "2nd"],
		[3, "3rd"],
		[4, "4th"],
		[11, "11th"],
		[12, "12th"],
		[21, "21st"],
		[112, "112th"],
	])("%i is %s", (n, s) => expect(ordinal(n)).toBe(s));
});
